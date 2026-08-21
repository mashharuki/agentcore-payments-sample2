# apps/cdk

このパッケージのCDKアプリは3つのスタックで構成される（詳細は [`docs/design.md`](../../docs/design.md) 7章参照）。

```
FoundationStack     VPC（パブリックサブネットのみ）・ECSクラスター・
                     facilitator用Secrets・AgentCore Payments用4ロールIAM
       │
       ▼
X402WeatherStack     resource server + facilitator の 自前ECR + ECS Fargate + ALB
       │
       ▼
McpStack             MCP server の 自前ECR + ECS Fargate + ALB
                     （taskRole = ProcessPaymentRole）
```

`McpStack` は `PAYMENT_MANAGER_ARN` / `PAYMENT_INSTRUMENT_ID` / `PAYMENT_SESSION_ID` / `PAYMENT_USER_ID`
環境変数が無いとデプロイ時にエラーで停止する（`agentcore-payments-admin.ts`で発行してから渡す2段階デプロイ。
ルートの[README](../../README.md)参照）。

## セットアップ

```bash
pnpm install
# 初回のみ、CDKのブートストラップ用リソースをアカウント/リージョンに作成
npx cdk bootstrap
```

## デプロイ

```bash
# Seller側
SELLER_PAYTO_ADDRESS=0xあなたの受取ウォレット pnpm cdk deploy FoundationStack X402WeatherStack

# facilitatorの秘密鍵をSecrets Managerに投入（デプロイ後、1回のみ。値はGitに含めない）
aws secretsmanager put-secret-value \
  --secret-id agentcore-payments-sample/dev/facilitator-evm-private-key \
  --secret-string '{"EVM_PRIVATE_KEY":"0x..."}'

# Payer側（agentcore-payments-admin.tsでのセットアップ完了後）
PAYMENT_MANAGER_ARN=... PAYMENT_INSTRUMENT_ID=... PAYMENT_SESSION_ID=... PAYMENT_USER_ID=... \
pnpm cdk deploy McpStack
```

`cdk deploy`はローカルでDockerイメージをビルドし、各サービス専用のECRリポジトリへ`cdk-ecr-deployment`経由でコピーする（design.md 7.5節）。Dockerが起動している必要がある。

## AgentCore Payments 管理者スクリプト

```bash
pnpm --filter cdk payments:admin setup-connector     # PaymentManager/Connector/CredentialProvider作成
pnpm --filter cdk payments:admin create-instrument    # Payment Instrument（ウォレット）作成
pnpm --filter cdk payments:admin new-session          # Payment Session発行（TTYでの承認必須）
pnpm --filter cdk payments:admin status               # セッション残予算・ウォレット残高確認
```

人間がTTYで実行することを前提としたスクリプト（design.md 7.2節）。CI・エージェント経由での`new-session`実行は拒否される。

## destroy（リソース削除）

**必ず以下の順序で実行する**（依存関係の逆順）。ECRリポジトリは `emptyOnDelete: true` を設定しているため、
イメージが残っていても`cdk destroy`だけでリポジトリごと削除できる。

```bash
pnpm cdk destroy McpStack
pnpm cdk destroy X402WeatherStack
pnpm cdk destroy FoundationStack
```

**重要**: `cdk destroy`は **Amazon Bedrock AgentCore Payments 側のリソース（PaymentManager / Connector /
CredentialProvider / Instrument / Session）を削除しない**（CDK管理外、design.md 7.5節）。放置すると
PaymentManagerが残り続けるため、CDKスタックのdestroyとは別に手動で削除する:

```bash
# 現時点ではAWS CLI/コンソールから削除する（Payment Instrument → Connector → CredentialProvider → Manager の順）
aws bedrock-agentcore delete-payment-instrument --payment-manager-arn <ARN> --payment-instrument-id <ID>
aws bedrock-agentcore-control delete-payment-connector --payment-manager-id <ID> --payment-connector-id <ID>
aws bedrock-agentcore-control delete-payment-credential-provider --credential-provider-arn <ARN>
aws bedrock-agentcore-control delete-payment-manager --payment-manager-id <ID>
```

## テスト・診断コマンド

```bash
pnpm cdk test                                    # jest（FoundationStackのIAM/VPC設計を検証）
pnpm cdk synth                                   # CloudFormationテンプレート生成（Dockerイメージも実際にビルドされる）
pnpm cdk diff FoundationStack                     # デプロイ済みリソースとの差分確認
```

`cdk synth`の実行にはPAYMENT系ランタイム変数（`PAYMENT_MANAGER_ARN`等）とDockerが必要。CIやローカルの型チェックだけを
行いたい場合は `pnpm --filter cdk exec tsc --noEmit` を使う。

## cdk-nag（セキュリティ静的チェック）

全スタックに `AwsSolutionsChecks`（cdk-nag v3、`Validations.of(app).addPlugins(...)`経由）を適用している。
検証用途で意図的に許容している逸脱は `bin/cdk.ts` 内で `Validations.of(stack).acknowledge({id, reason})` により
理由付きで明示している。一部の finding（IAM5/IAM4のうち、ARNにCFN疑似パラメータを含むもの）は
cdk-nag v3とaws-cdk-lib間の既知の相性問題により明示的なacknowledgeができず、`cdk synth`実行時にERRORとして
残り続ける — これは既知の制約であり、内容はコード（`bin/cdk.ts`のコメント）で確認できる。
