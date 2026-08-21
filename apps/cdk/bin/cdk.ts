#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { Validations } from "aws-cdk-lib";
import { AwsSolutionsChecks } from "cdk-nag";
import { devConfig } from "../lib/config/environments/dev";
import { FoundationStack } from "../lib/foundation-stack";
import { McpStack } from "../lib/mcp-stack";
import { X402WeatherStack } from "../lib/x402-weather-stack";

const app = new cdk.App();

// 現時点ではdev環境のみサポート。環境を増やす場合は environments/ 配下に追加し、
// `cdk deploy -c env=staging` のようにcontext経由で切り替える設計にする（design.md 7.4節）。
const appConfig = devConfig;

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: appConfig.region,
};
const tags = {
  Project: "agentcore-payments-sample2",
  Environment: appConfig.envName,
};

// Foundation CDKスタック
const foundationStack = new FoundationStack(app, "FoundationStack", {
  env,
  tags,
  appConfig,
});

// x402 サーバー用のCDKスタック
const x402WeatherStack = new X402WeatherStack(app, "X402WeatherStack", {
  env,
  tags,
  appConfig,
  vpc: foundationStack.vpc,
  cluster: foundationStack.cluster,
  facilitatorSigningKeySecret: foundationStack.facilitatorSigningKeySecret,
});
x402WeatherStack.addStackDependency(foundationStack);

// McpStackは、apps/cdk/scripts/agentcore-payments-admin.ts でPaymentManager/Instrument/Sessionを
// 発行した後（README参照）にデプロイする2段階目のスタック。実際のPaymentManager ARN
// （AWSがpaymentManagerNameにランダムなサフィックスを付与するため事前には分からない）は
// appConfig.runtimePayment.paymentManagerArn（PAYMENT_MANAGER_ARN環境変数）経由で受け取る。
const mcpStack = new McpStack(app, "McpStack", {
  env,
  tags,
  appConfig,
  cluster: foundationStack.cluster,
  processPaymentRole: foundationStack.agentCorePaymentsRoles.processPaymentRole,
  resourceServerUrl: x402WeatherStack.resourceServer.url,
});
mcpStack.addStackDependency(x402WeatherStack);

// cdk-nag v3でセキュリティ/コンプライアンスの静的チェックを全スタックに適用する
// （v3ではAspects.of(app).add(...)ではなく Validations.of(app).addPlugins(...) を使う。
//  NagSuppressions APIも廃止され、Validations.of(construct).acknowledge({id, reason}) に統合された）
Validations.of(app).addPlugins(new AwsSolutionsChecks(app, { verbose: true }));

// 検証用途で意図的に許容している逸脱（design.md 7.5/7.6節）。
// v3では個々のfinding IDを個別にacknowledgeする必要があり、ルールIDのプレフィックス一括抑制は
// 未対応（cdk-nag v3の仕様）。以下のID・理由は実際に `pnpm --filter cdk synth` を実行し、
// 出力された "Acknowledge with '...'" の内容を元に決定したもの（推測ではなく実行結果ベース。2026-08-22確認）。
//
// 【既知の制約】cdk-nagがfinding IDとして提案する文字列の一部（例:
// "AwsSolutions-IAM5[Resource::arn:aws:bedrock-agentcore:*:<AWS::AccountId>:payment-manager/*]"）は、
// ARNに含まれるCFN疑似パラメータ（<AWS::AccountId>, <AWS::Partition>）自体が"::"を含むため、
// aws-cdk-lib の Validations.acknowledge() が課す「識別子中の"::"は1箇所のみ」という制約に抵触し、
// そのままでは受理されない（cdk-nag v3.0.2 + aws-cdk-lib 2.266.0の組み合わせで確認した既知の相性問題）。
// 該当する5件（下記コメント参照）は明示的なacknowledgeができないため、synth結果にERRORとして残り続ける。
// いずれもAWS公式ドキュメント通りの構成、またはサードパーティコンストラクト（cdk-ecr-deployment）の
// 内部実装によるものであり、内容は本ファイルとlib/agentcore-payments-iam.tsのコードレビューで確認できる。

// FoundationStack: AgentCore Payments用IAMロール、facilitator秘密鍵Secret、VPC/ECSクラスターのコスト最適化設定
Validations.of(foundationStack).acknowledge(
  {
    id: "AwsSolutions-SMG4",
    reason:
      "facilitatorのガス代支払い用EOA秘密鍵。ローテーションには新ウォレットへの資金移動が必要でSecretsManager標準の自動ローテーションの対象外（design.md 7.6節）",
  },
  {
    id: "AwsSolutions-VPC7",
    reason:
      "個人検証プロジェクトのためVPC Flow Logsは有効化しない（コスト優先）",
  },
  {
    id: "AwsSolutions-ECS4",
    reason:
      "個人検証プロジェクトのためContainer Insightsは無効化している（コスト優先）",
  },
  // 未acknowledge（上記の既知の制約により）:
  //   AwsSolutions-IAM5[Resource::.../payment-manager/*]        x2 (ControlPlaneRole, ManagementRole, ProcessPaymentRole)
  //   AwsSolutions-IAM5[Resource::.../payment-manager/*/connector/*]
  //   AwsSolutions-IAM5[Resource::.../token-vault/*/paymentcredentialprovider/*]
  // → いずれもAWS公式ドキュメント「IAM roles for AgentCore payments」の推奨ポリシーそのもの（design.md 7.2節）
);

// X402WeatherStack・McpStack共通: ALB／セキュリティグループ／ECSタスク実行ロール／非機密の環境変数
for (const stack of [x402WeatherStack, mcpStack]) {
  Validations.of(stack).acknowledge(
    {
      id: "AwsSolutions-ECS2",
      reason:
        "機密情報はEVM_PRIVATE_KEYのみでSecrets Manager経由。それ以外（PORT/URL/PaymentManager ARN等）は非機密の設定値のためプレーンな環境変数で問題ない（design.md 8章の環境変数一覧を参照）",
    },
    {
      id: "AwsSolutions-ELB2",
      reason: "検証用途のためALBアクセスログは無効化している（コスト優先）",
    },
    {
      id: "AwsSolutions-EC23",
      reason:
        "検証用途のためALBを0.0.0.0/0に公開している。カスタムドメイン導入時に見直す（design.md 7.6節）",
    },
    {
      id: "AwsSolutions-IAM5[Resource::*]",
      reason:
        "ECSタスク実行ロールの ecr:GetAuthorizationToken はAWS仕様上リソースレベル権限を指定できずResource:*が必須（AWS公式の既知の制約）",
    },
    // 未acknowledge（上記の既知の制約により）:
    //   AwsSolutions-IAM4[Policy::.../AWSLambdaBasicExecutionRole] （cdk-ecr-deploymentが内部生成するLambda実行ロール）
    // → サードパーティコンストラクト（cdk-ecr-deployment）の内部実装。design.md 7.5節参照
  );
}
