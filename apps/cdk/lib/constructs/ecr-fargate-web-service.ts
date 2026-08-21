import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import { DockerImageAsset } from "aws-cdk-lib/aws-ecr-assets";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import type * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as ecrdeploy from "cdk-ecr-deployment";
import { Construct } from "constructs";
import * as path from "node:path";
import type { ServiceConfig } from "../config/app-config";

export type EcrFargateWebServiceProps = {
  readonly config: ServiceConfig;
  readonly cluster: ecs.ICluster;
  /** Dockerビルドコンテキスト（モノレポのルート） */
  readonly dockerBuildContext: string;
  /** dockerBuildContext からの相対パス（例: "apps/x402/server/Dockerfile"） */
  readonly dockerfilePath: string;
  readonly environment?: Record<string, string>;
  readonly secrets?: Record<string, ecs.Secret>;
  /** 指定しない場合はECSタスク実行のたびに新規ロールが自動生成される */
  readonly taskRole?: iam.IRole;
};

/**
 * 「自前ECRリポジトリ + ECS Fargate + ALB（デフォルトDNS名）」の3点セットを1つにまとめたコンストラクト。
 *
 * ECRリポジトリはCDKアセット用の共有リポジトリ（bootstrap管理・スタックのライフサイクル外）を使わず、
 * サービスごとに専用リポジトリを作成する。`DockerImageAsset` でローカルビルドしたイメージを
 * `cdk-ecr-deployment` でこの専用リポジトリへコピーし、Fargateタスクはそこからイメージをpullする。
 * これにより「デプロイ時にリポジトリ作成＋イメージpush」「destroy時にリポジトリ＋イメージ削除
 * （emptyOnDelete）」が対になる（design.md 7.5節）。
 */
export class EcrFargateWebService extends Construct {
  /** ECRリポジトリ */
  public readonly repository: ecr.Repository;
  /** Fargate サービス */
  public readonly service: ecsPatterns.ApplicationLoadBalancedFargateService;
  /** ALBのデフォルトURL */
  public readonly url: string;

  /**
   * コンストラクター
   * @param scope
   * @param id
   * @param props
   */
  constructor(scope: Construct, id: string, props: EcrFargateWebServiceProps) {
    super(scope, id);

    const { config } = props;

    // 自前ECRリポジトリ（destroy時にイメージごと削除できるようにする）
    this.repository = new ecr.Repository(this, "Repository", {
      repositoryName: config.serviceName,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,
      imageScanOnPush: true,
    });

    // ローカルでDockerイメージをビルド（CDKブートストラップの共有アセットリポジトリに一時push）
    const asset = new DockerImageAsset(this, "BuildImage", {
      directory: props.dockerBuildContext,
      file: props.dockerfilePath,
      platform: cdk.aws_ecr_assets.Platform.LINUX_AMD64,
    });

    // ビルドしたイメージを自前リポジトリへコピーする
    const imageTag = "latest";
    const deployment = new ecrdeploy.ECRDeployment(this, "PushImage", {
      src: new ecrdeploy.DockerImageName(asset.imageUri),
      dest: new ecrdeploy.DockerImageName(
        `${this.repository.repositoryUri}:${imageTag}`,
      ),
    });

    const logGroup = new logs.LogGroup(this, "LogGroup", {
      logGroupName: `/ecs/${config.serviceName}`,
      retention: config.logRetention,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.service = new ecsPatterns.ApplicationLoadBalancedFargateService(
      this,
      "Service",
      {
        cluster: props.cluster,
        cpu: config.cpu,
        memoryLimitMiB: config.memoryLimitMiB,
        desiredCount: config.desiredCount,
        publicLoadBalancer: true,
        assignPublicIp: true,
        taskSubnets: { subnetType: ec2.SubnetType.PUBLIC },
        healthCheckGracePeriod: cdk.Duration.seconds(60),
        circuitBreaker: { rollback: true },
        minHealthyPercent: 100,
        maxHealthyPercent: 200,
        taskImageOptions: {
          image: ecs.ContainerImage.fromEcrRepository(
            this.repository,
            imageTag,
          ),
          containerPort: config.containerPort,
          environment: props.environment,
          secrets: props.secrets,
          taskRole: props.taskRole,
          logDriver: ecs.LogDrivers.awsLogs({
            logGroup,
            streamPrefix: config.serviceName,
          }),
        },
      },
    );

    // イメージが自前リポジトリへコピーされてからFargateサービスを作成する
    this.service.node.addDependency(deployment);

    this.service.targetGroup.configureHealthCheck({
      path: config.healthCheckPath,
      healthyHttpCodes: "200",
    });

    this.url = `http://${this.service.loadBalancer.loadBalancerDnsName}`;

    new cdk.CfnOutput(this, "ServiceUrl", { value: this.url });
  }
}

/** モノレポのルートディレクトリ（apps/cdk/lib/constructs から4階層上） */
export const monorepoRoot = path.join(__dirname, "..", "..", "..", "..");
