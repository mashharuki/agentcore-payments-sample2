import * as cdk from "aws-cdk-lib";
import type * as ecs from "aws-cdk-lib/aws-ecs";
import type * as iam from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";
import type { AppConfig } from "./config/app-config";
import {
  EcrFargateWebService,
  monorepoRoot,
} from "./constructs/ecr-fargate-web-service";

export type McpStackProps = cdk.StackProps & {
  readonly appConfig: AppConfig;
  readonly cluster: ecs.ICluster;
  readonly processPaymentRole: iam.IRole;
  readonly resourceServerUrl: string;
};

/**
 * apps/mcp のECR+ECS Fargate+ALB一式。
 * タスクロール（taskRole）に ProcessPaymentRole をそのまま指定することで、
 * MCPサーバーが実行できるのは「既に承認済みのセッションに対するProcessPayment」だけに限定される
 * （CreatePaymentSession等の書き込み系権限は一切持たない。design.md 6.4/7.2節）。
 */
export class McpStack extends cdk.Stack {
  /** Fargate上に公開するMCPサーバー */
  public readonly mcpServer: EcrFargateWebService;

  /**
   * コンストラクター
   * @param scope
   * @param id
   * @param props
   */
  constructor(scope: Construct, id: string, props: McpStackProps) {
    super(scope, id, props);

    const { appConfig } = props;
    const { paymentManagerArn, instrumentId, sessionId, userId } =
      appConfig.runtimePayment;

    if (!paymentManagerArn || !instrumentId || !sessionId || !userId) {
      throw new Error(
        "McpStackのデプロイには PAYMENT_MANAGER_ARN / PAYMENT_INSTRUMENT_ID / PAYMENT_SESSION_ID / " +
          "PAYMENT_USER_ID が必要です。先に `pnpm --filter cdk payments:admin setup-connector` " +
          "/ `create-instrument` / `new-session` を実行し、発行された値を環境変数として設定してから" +
          "再度デプロイしてください（README参照）。",
      );
    }

    this.mcpServer = new EcrFargateWebService(
      this,
      appConfig.mcpServer.logicalId,
      {
        config: appConfig.mcpServer,
        cluster: props.cluster,
        dockerBuildContext: monorepoRoot,
        dockerfilePath: "apps/mcp/Dockerfile",
        taskRole: props.processPaymentRole,
        environment: {
          PORT: String(appConfig.mcpServer.containerPort),
          AWS_REGION: appConfig.region,
          PAYWALL_API_BASE_URL: props.resourceServerUrl,
          PAYMENT_MANAGER_ARN: paymentManagerArn,
          PAYMENT_INSTRUMENT_ID: instrumentId,
          PAYMENT_SESSION_ID: sessionId,
          PAYMENT_USER_ID: userId,
        },
      },
    );

    new cdk.CfnOutput(this, "McpServerUrl", {
      value: `${this.mcpServer.url}/mcp`,
      description: "claude mcp add --transport http <name> <この値> で登録する",
    });
  }
}
