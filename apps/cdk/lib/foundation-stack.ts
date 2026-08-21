import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";
import {
  type AgentCorePaymentsIamRoles,
  createAgentCorePaymentsIamRoles,
} from "./agentcore-payments-iam";
import type { AppConfig } from "./config/app-config";

export type FoundationStackProps = cdk.StackProps & {
  readonly appConfig: AppConfig;
};

/**
 * 3サービス共通の基盤（VPC・ECSクラスター・EVM_PRIVATE_KEY用Secret・AgentCore Payments用4ロールIAM）。
 * 変更頻度が低いリソースをまとめ、X402WeatherStack / McpStack から参照する。
 */
export class FoundationStack extends cdk.Stack {
  /** VPC */
  public readonly vpc: ec2.Vpc;
  /** ECS クラスター */
  public readonly cluster: ecs.Cluster;
  /** facilitator用の秘密鍵 */
  public readonly facilitatorSigningKeySecret: secretsmanager.Secret;
  /** AgentCore paymentsで使用するIAMロール */
  public readonly agentCorePaymentsRoles: AgentCorePaymentsIamRoles;

  /**
   * コンストラクター
   * @param scope
   * @param id
   * @param props
   */
  constructor(scope: Construct, id: string, props: FoundationStackProps) {
    super(scope, id, props);

    const { appConfig } = props;

    // VPC：パブリックサブネットのみでNAT Gatewayを使わない（検証用途のコスト最適化）。
    // Fargateタスクにはパブリックリンクを直接付与し、Base SepoliaのRPCエンドポイント等への
    // 外向き通信を確保する。
    this.vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
    });

    this.cluster = new ecs.Cluster(this, "Cluster", {
      vpc: this.vpc,
      clusterName: `agentcore-payments-sample-${appConfig.envName}`,
      containerInsightsV2: ecs.ContainerInsights.DISABLED,
    });

    // facilitatorのガス代支払い用EOA秘密鍵（値はデプロイ後に手動でAWSコンソール/CLIから投入する。
    // CDKコード・Gitリポジトリには一切含めない）
    this.facilitatorSigningKeySecret = new secretsmanager.Secret(
      this,
      "FacilitatorSigningKey",
      {
        secretName: `agentcore-payments-sample/${appConfig.envName}/facilitator-evm-private-key`,
        description:
          "x402facilitatorがBase Sepoliaへの決済実行(ガス代支払い)に使うEVM秘密鍵",
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      },
    );

    // Amazon Bedrock AgentCore Payments 用の4ロール分離モデル（design.md 7.2節）
    this.agentCorePaymentsRoles = createAgentCorePaymentsIamRoles(
      this,
      appConfig.paymentManagerName,
    );

    new cdk.CfnOutput(this, "ResourceRetrievalRoleArn", {
      value: this.agentCorePaymentsRoles.resourceRetrievalRole.roleArn,
      description:
        "agentcore-payments-admin.ts の setup-connector で CreatePaymentManager の roleArn に渡すロールARN",
    });
    new cdk.CfnOutput(this, "ControlPlaneRoleArn", {
      value: this.agentCorePaymentsRoles.controlPlaneRole.roleArn,
    });
    new cdk.CfnOutput(this, "ManagementRoleArn", {
      value: this.agentCorePaymentsRoles.managementRole.roleArn,
    });
    new cdk.CfnOutput(this, "ProcessPaymentRoleArn", {
      value: this.agentCorePaymentsRoles.processPaymentRole.roleArn,
    });
  }
}
