import { RetentionDays } from "aws-cdk-lib/aws-logs";
import type { AppConfig } from "../app-config";

export const devConfig: AppConfig = {
  envName: "dev",
  region: process.env.CDK_DEFAULT_REGION ?? "us-west-2",
  // AWS側がPaymentManager名に `^[a-zA-Z][a-zA-Z0-9]{0,47}$` を要求する（ハイフン不可）ため
  // 英数字のみ。apps/cdk/scripts/agentcore-payments-admin.ts のPAYMENT_MANAGER_NAMEデフォルトと
  // 必ず同じ値にすること（ResourceRetrievalRoleの信頼ポリシーがこの名前を前提にしているため）。
  paymentManagerName: "AgentcorePaymentsSampleDev",
  // デプロイ前に必ず実際のウォレットアドレスへ差し替える（README参照）。
  // `SELLER_PAYTO_ADDRESS` 環境変数で上書き可能。
  sellerPayToAddress:
    process.env.SELLER_PAYTO_ADDRESS ??
    "0x0000000000000000000000000000000000000000",
  // FoundationStack/X402WeatherStackのデプロイ後、agentcore-payments-admin.tsで発行してから設定する
  runtimePayment: {
    paymentManagerArn: process.env.PAYMENT_MANAGER_ARN,
    instrumentId: process.env.PAYMENT_INSTRUMENT_ID,
    sessionId: process.env.PAYMENT_SESSION_ID,
    userId: process.env.PAYMENT_USER_ID,
  },
  resourceServer: {
    logicalId: "X402ResourceServer",
    serviceName: "x402-resource-server-dev",
    cpu: 256,
    memoryLimitMiB: 512,
    containerPort: 4021,
    healthCheckPath: "/health",
    desiredCount: 1,
    logRetention: RetentionDays.ONE_WEEK,
  },
  facilitator: {
    logicalId: "X402Facilitator",
    serviceName: "x402-facilitator-dev",
    cpu: 256,
    memoryLimitMiB: 512,
    containerPort: 4022,
    healthCheckPath: "/health",
    desiredCount: 1,
    logRetention: RetentionDays.ONE_WEEK,
  },
  mcpServer: {
    logicalId: "McpServer",
    serviceName: "mcp-server-dev",
    cpu: 256,
    memoryLimitMiB: 512,
    containerPort: 4024,
    healthCheckPath: "/health",
    desiredCount: 1,
    logRetention: RetentionDays.ONE_WEEK,
  },
};
