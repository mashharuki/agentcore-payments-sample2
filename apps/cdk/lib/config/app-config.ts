import type { RetentionDays } from "aws-cdk-lib/aws-logs";

/**
 * 1サービス（1つのECS Fargate + ALB + 自前ECR）ぶんの設定。
 * 論理ID・サービス名・CPU/メモリ・ヘルスチェック等をハードコードせず、
 * ここに集約して環境ごとに切り替えられるようにする。
 */
export type ServiceConfig = {
  /** CDK上の論理IDに使うベース名（例: "X402ResourceServer"） */
  readonly logicalId: string;
  /** ECSサービス名／ECRリポジトリ名のベース（AWSリソース名として使われるため小文字・ハイフン区切り） */
  readonly serviceName: string;
  /** Fargate task cpu（vCPU units） */
  readonly cpu: 256 | 512 | 1024;
  /** Fargate task memory (MiB) */
  readonly memoryLimitMiB: 512 | 1024 | 2048;
  readonly containerPort: number;
  readonly healthCheckPath: string;
  readonly desiredCount: number;
  readonly logRetention: RetentionDays;
};

export type AppConfig = {
  readonly envName: "dev" | "staging" | "prod";
  readonly region: string;
  /**
   * Amazon Bedrock AgentCore Payments の PaymentManager 名（固定）。
   * apps/cdk/scripts/agentcore-payments-admin.ts が CreatePaymentManager 時にこの名前を使う。
   * ResourceRetrievalRole の信頼ポリシーもこの名前を前提に構築するため、
   * 一度決めたら安易に変更しない。
   */
  readonly paymentManagerName: string;
  /**
   * x402リソースサーバーの受取ウォレットアドレス（payTo）。秘密情報ではないが
   * アカウント固有の値のため、CDKコードにハードコードせず環境変数/contextから注入する。
   */
  readonly sellerPayToAddress: string;
  readonly resourceServer: ServiceConfig;
  readonly facilitator: ServiceConfig;
  readonly mcpServer: ServiceConfig;
  /**
   * apps/cdk/scripts/agentcore-payments-admin.ts で発行した Payment Instrument / Session の識別子。
   * FoundationStack・X402WeatherStackのデプロイ後、管理者スクリプトを実行してから
   * McpStackをデプロイする2段階デプロイになる（README参照）。未設定の場合はMcpStackのデプロイ時にエラーとする。
   */
  readonly runtimePayment: {
    /**
     * CreatePaymentManagerの実際の戻り値ARN（AWSがpaymentManagerNameにランダムなサフィックスを
     * 付与するため、事前にパターンから組み立てることはできない）。
     */
    readonly paymentManagerArn?: string;
    readonly instrumentId?: string;
    readonly sessionId?: string;
    readonly userId?: string;
  };
};
