import * as cdk from "aws-cdk-lib";
import type * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import type * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";
import type { AppConfig } from "./config/app-config";
import {
  EcrFargateWebService,
  monorepoRoot,
} from "./constructs/ecr-fargate-web-service";

export type X402WeatherStackProps = cdk.StackProps & {
  readonly appConfig: AppConfig;
  readonly vpc: ec2.IVpc;
  readonly cluster: ecs.ICluster;
  readonly facilitatorSigningKeySecret: secretsmanager.ISecret;
};

/**
 * Seller側（apps/x402/server, apps/x402/facilitator）のECR+ECS Fargate+ALB一式。
 * AgentCore Payments はPayer側の署名代行のみを行い、402の検証・オンチェーン決済（verify/settle）は
 * 引き続きこのスタックが持つ自前facilitatorの責務（design.md 1章）。
 */
export class X402WeatherStack extends cdk.Stack {
  /** リソースサーバー */
  public readonly resourceServer: EcrFargateWebService;
  /** ファシリテーター */
  public readonly facilitator: EcrFargateWebService;

  /**
   * コンストラクター
   * @param scope
   * @param id
   * @param props
   */
  constructor(scope: Construct, id: string, props: X402WeatherStackProps) {
    super(scope, id, props);

    const { appConfig } = props;

    this.facilitator = new EcrFargateWebService(
      this,
      appConfig.facilitator.logicalId,
      {
        config: appConfig.facilitator,
        cluster: props.cluster,
        dockerBuildContext: monorepoRoot,
        dockerfilePath: "apps/x402/facilitator/Dockerfile",
        environment: {
          PORT: String(appConfig.facilitator.containerPort),
        },
        secrets: {
          EVM_PRIVATE_KEY: ecs.Secret.fromSecretsManager(
            props.facilitatorSigningKeySecret,
          ),
        },
      },
    );

    this.resourceServer = new EcrFargateWebService(
      this,
      appConfig.resourceServer.logicalId,
      {
        config: appConfig.resourceServer,
        cluster: props.cluster,
        dockerBuildContext: monorepoRoot,
        dockerfilePath: "apps/x402/server/Dockerfile",
        environment: {
          PORT: String(appConfig.resourceServer.containerPort),
          FACILITATOR_URL: this.facilitator.url,
          EVM_ADDRESS: appConfig.sellerPayToAddress,
        },
      },
    );

    new cdk.CfnOutput(this, "ResourceServerUrl", {
      value: this.resourceServer.url,
    });
    new cdk.CfnOutput(this, "FacilitatorUrl", { value: this.facilitator.url });
  }
}
