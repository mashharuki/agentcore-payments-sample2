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
//
// この4つの環境変数が未設定の間はMcpStackを一切構築しない。bin/cdk.tsはCDK CLIが対象スタックを
// 絞り込むより前に全スタックをインスタンス化するため、ここで無条件にnewしてしまうと
// `cdk deploy FoundationStack` のような他スタック単体の操作までMcpStackのコンストラクタ内の
// エラーで巻き込んでしまう（README手順2のFoundationStack単体デプロイが永久に失敗するバグになる）。
const { paymentManagerArn, instrumentId, sessionId, userId } =
  appConfig.runtimePayment;
const hasRuntimePaymentConfig = Boolean(
  paymentManagerArn && instrumentId && sessionId && userId,
);

const mcpStack = hasRuntimePaymentConfig
  ? new McpStack(app, "McpStack", {
      env,
      tags,
      appConfig,
      cluster: foundationStack.cluster,
      processPaymentRole:
        foundationStack.agentCorePaymentsRoles.processPaymentRole,
      resourceServerUrl: x402WeatherStack.resourceServer.url,
    })
  : undefined;
mcpStack?.addStackDependency(x402WeatherStack);

if (!mcpStack) {
  console.warn(
    "[cdk] PAYMENT_MANAGER_ARN / PAYMENT_INSTRUMENT_ID / PAYMENT_SESSION_ID / PAYMENT_USER_ID が" +
      "未設定のため McpStack はスキップします。先に `pnpm --filter cdk payments:admin " +
      "setup-connector` / `create-instrument` / `new-session` を実行してから、発行された値を" +
      "環境変数に設定して再度デプロイしてください（README参照）。",
  );
}

// cdk-nag v3でセキュリティ/コンプライアンスの静的チェックを全スタックに適用する
// （v3ではAspects.of(app).add(...)ではなく Validations.of(app).addPlugins(...) を使う。
//  NagSuppressions APIも廃止され、Validations.of(construct).acknowledge({id, reason}) に統合された）
Validations.of(app).addPlugins(new AwsSolutionsChecks(app, { verbose: true }));

// 検証用途で意図的に許容している逸脱（design.md 7.5/7.6節）。
// v3では個々のfinding IDを個別にacknowledgeする必要があり、ルールIDのプレフィックス一括抑制は
// 未対応（cdk-nag v3の仕様）。以下のID・理由は実際に `pnpm --filter cdk synth` を実行し、
// 出力された "Acknowledge with '...'" の内容を元に決定したもの（推測ではなく実行結果ベース）。
//
// AgentCore Payments系のIAM5（payment-manager/* 等へのワイルドカード）はACCOUNT ID込みの
// finding IDになるが、"::"の出現は"Resource::"の1箇所のみなので
// aws-cdk-lib の Validations.acknowledge() が課す「識別子中の"::"は1箇所まで」制約には抵触しない
// （qualifyId()の実装を確認済み。過去に「受理されない既知の制約」と誤って記録されていたが、
// 実際に下記の形でacknowledgeするとsynthのERRORは解消される）。

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
  {
    id: `AwsSolutions-IAM5[Resource::arn:aws:bedrock-agentcore:*:${env.account}:payment-manager/*]`,
    reason:
      "AWS公式ドキュメント「IAM roles for AgentCore payments」が推奨するポリシーそのもの（ControlPlaneRole/ManagementRole/ProcessPaymentRoleに共通。design.md 7.2節）",
  },
  {
    id: `AwsSolutions-IAM5[Resource::arn:aws:bedrock-agentcore:*:${env.account}:payment-manager/*/connector/*]`,
    reason:
      "AWS公式ドキュメント「IAM roles for AgentCore payments」が推奨するポリシーそのもの（ControlPlaneRole。design.md 7.2節）",
  },
  {
    id: `AwsSolutions-IAM5[Resource::arn:aws:bedrock-agentcore:*:${env.account}:token-vault/*/paymentcredentialprovider/*]`,
    reason:
      "AWS公式ドキュメント「IAM roles for AgentCore payments」が推奨するポリシーそのもの（ControlPlaneRole。design.md 7.2節）",
  },
);

// X402WeatherStack・McpStack共通: ALB／セキュリティグループ／ECSタスク実行ロール／非機密の環境変数
const stacksNeedingCommonAcknowledgements = mcpStack
  ? [x402WeatherStack, mcpStack]
  : [x402WeatherStack];
for (const stack of stacksNeedingCommonAcknowledgements) {
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
    // 未acknowledge: AwsSolutions-IAM4[Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole]
    // （cdk-ecr-deploymentが内部生成するLambda実行ロールが使うAWS管理ポリシー）。
    // このfinding IDは `<AWS::Partition>` 疑似パラメータ自体に"::"を含むため、
    // id.split("::").length が2を超えて aws-cdk-lib の Validations.acknowledge() が
    // 例外を投げる（qualifyId()の実装で確認済み。前述のpayment-manager系IAM5とは異なり、
    // こちらは実際にacknowledge不能な既知の制約）。サードパーティコンストラクト
    // （cdk-ecr-deployment）の内部実装によるものであり、design.md 7.5節参照。
  );
}
