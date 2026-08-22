# agentcore-payments-sample2

Amazon Bedrock AgentCore Payments を使って x402 決済プロトコルを一気通貫で検証するためのリポジトリ。

- x402で保護された天気予報API（`GET /weather`、$0.01、Base Sepolia）
- 決済の実行は **Amazon Bedrock AgentCore Payments**（`ProcessPayment` API）に委譲し、Wallet Providerには **Privy**（`StripePrivy` コネクタ）を使用
- Claude Codeからは **MCP** 経由でこの決済フローを呼び出せる

設計の詳細（アーキテクチャ図・シーケンス図・採用AWSサービス一覧・IAM設計）は [`docs/design.md`](docs/design.md) を、要件は [`docs/requirement.md`](docs/requirement.md) を参照してください。

## モノレポ構成

```
apps/
  x402/
    server/       # Seller: x402で保護された天気予報API（Hono）
    facilitator/  # Seller: x402の /verify /settle を実行する決済実行基盤（Base Sepolia）
    client/       # Payer: 検証用スクリプト（ゴール①）
  mcp/            # Payer: MCPサーバー。Claude Codeから呼ばれ内部で決済を代行する（ゴール②）
  mpp/            # MPP（Machine Payment Protocol）のリファレンス実装。本フェーズでは変更しない
  cdk/            # AWSインフラ（ECS Fargate + ALB + 自前ECR + AgentCore Payments用IAM）
packages/
  shared/         # zodバリデーション・AgentCore Payments連携ヘルパー（processX402Payment等）
```

## 前提条件

- Node.js 22以降、`pnpm@10.33.0`（`corepack enable` 推奨）
- AWSアカウント、`aws configure` 済みのCLIプロファイル（Amazon Bedrock AgentCore Payments 提供リージョンであること）
- [Privyダッシュボード](https://dashboard.privy.io/) のアカウント（Wallet Provider用）
- Base Sepoliaのテストネット資金（USDC・ETH）— [Circle Faucet](https://faucet.circle.com/) 等で取得
- AWSへのデプロイを行う場合はDocker（`cdk deploy`が内部でDockerイメージをビルドするため）

```bash
git clone <このリポジトリ>
cd agentcore-payments-sample2
pnpm install
```

## クイックスタート（ローカル）

3つのサービスをそれぞれ別ターミナルで起動する。

```bash
# 1. facilitator（決済の検証・オンチェーン実行）
cp apps/x402/facilitator/.env.example apps/x402/facilitator/.env
# .env に EVM_PRIVATE_KEY（ガス代支払い用EOA、Base SepoliaのETH残高が必要）を設定
pnpm facilitator dev

# 2. resource server（x402で保護された /weather API）
cp apps/x402/server/.env.example apps/x402/server/.env
# .env に FACILITATOR_URL=http://localhost:4022、EVM_ADDRESS（受取ウォレット）を設定
pnpm x402server dev
```

この時点で `curl http://localhost:4021/weather` を叩くと `402 Payment Required` が返る（`payment-required` ヘッダーにBase64エンコードされた決済要件が入る）ことを確認できる。実際に支払いを完了するには、次の「AgentCore Paymentsのセットアップ」が必要。

## Amazon Bedrock AgentCore Payments のセットアップ

x402決済を行う側（Payer）は、ローカルの秘密鍵で直接署名するのではなく、AWSが管理する **AgentCore Payments** の `ProcessPayment` APIを呼び出して決済プルーフを取得する。裏側の署名は Privy（`StripePrivy` コネクタ）が行う。

セットアップは以下の順序で行う。すべて `apps/cdk/scripts/agentcore-payments-admin.ts`（`pnpm --filter cdk payments:admin <subcommand>`）を**人間がTTYで**実行する（design.md 7.2節の4ロールIAM分離モデルにより、対話的な承認や資格情報入力を必須にしている）。

### 1. Privyアプリの作成

1. [Privyダッシュボード](https://dashboard.privy.io/) で本プロジェクト専用のアプリを新規作成する（他用途のアプリを流用しない）
2. `App ID` と `App Secret` を控える
3. **Wallet Infrastructure > Keys and quorums** で新しいP-256鍵ペアを発行し、`Authorization ID` と `Authorization Private Key` を控える

### 2. FoundationStackのデプロイ（IAMロール一式）

```bash
pnpm cdk run deploy FoundationStack
```

出力される `ResourceRetrievalRoleArn` を控える（次のステップで使う）。

### 3. PaymentManager / PaymentConnector の作成

```bash
cd apps/cdk
RESOURCE_RETRIEVAL_ROLE_ARN=<手順2で控えたARN> pnpm payments:admin setup-connector
```

Privyの資格情報（App ID / App Secret / Authorization ID / Authorization Private Key）の入力を求められる。入力はターミナルにエコーされず、このプロセスの外には保存されない。完了すると `PAYMENT_MANAGER_ARN` と `PAYMENT_CONNECTOR_ID` が表示されるので控える。

### 4. Payment Instrument（ウォレット）の作成・入金

```bash
PAYMENT_MANAGER_ARN=<手順3のARN> PAYMENT_CONNECTOR_ID=<手順3のID> pnpm payments:admin create-instrument
```

表示された `redirectUrl` をブラウザで開き、**テストネットUSDCの入金** と **このプロジェクトへの署名権限の許可** を行う。完了するまで `PAYMENT_INSTRUMENT_ID` の残高は0のまま。

### 5. Payment Session（予算・有効期限）の作成

```bash
PAYMENT_MANAGER_ARN=<手順3のARN> PAYMENT_USER_ID=<手順4で使ったユーザーID> pnpm payments:admin new-session
```

上限予算・有効期限（15〜480分、AWSの制約）を入力し、最後に `approve` とタイプして承認する（非対話実行からは承認できない設計）。完了すると `PAYMENT_SESSION_ID` が表示される。

> セッションは有効期限が切れると失効するため、検証を再開するたびに `new-session` を再実行して新しい `PAYMENT_SESSION_ID` を発行する。

## ゴール①: x402クライアント単体での決済確認

```bash
cp apps/x402/client/.env.example apps/x402/client/.env
```

`.env` に以下を設定する（AWS認証情報はローカルの `aws configure` プロファイルを使うため`.env`には含めない）:

```bash
AWS_REGION=us-west-2
PAYMENT_MANAGER_ARN=<上記手順3>
PAYMENT_INSTRUMENT_ID=<上記手順4>
PAYMENT_SESSION_ID=<上記手順5>
PAYMENT_USER_ID=<上記手順4/5と同じユーザーID>
PAYWALL_API_BASE_URL=http://localhost:4021
PAYWALL_PATH=/weather
```

```bash
pnpm x402client dev
```

`AgentCore Payments経由で決済しました（processPaymentId: ...）` と表示されれば成功。

## ゴール②: Claude CodeからMCP経由での決済確認

`apps/mcp/.env` を新規作成し、以下を設定する（`PAYWALL_PATH`は不要、`PORT`省略時は4024）:

```bash
AWS_REGION=us-west-2
PAYMENT_MANAGER_ARN=<ゴール①と同じ>
PAYMENT_INSTRUMENT_ID=<ゴール①と同じ>
PAYMENT_SESSION_ID=<ゴール①と同じ>
PAYMENT_USER_ID=<ゴール①と同じ>
PAYWALL_API_BASE_URL=http://localhost:4021
```

```bash
pnpm mcp dev
```

別ターミナルでClaude Codeに接続する:

```bash
claude mcp add --transport http weather-x402 http://localhost:4024/mcp
```

Claude Codeから `get_weather` ツールを呼び出すと、内部でAgentCore Payments経由の決済が行われ、天気データと決済メタ情報（`processPaymentId`）が返る。署名済みプルーフ自体はモデルには渡らない。

## AWSへのデプロイ（本番相当のホスティング）

```bash
# 1. Seller側（resource server + facilitator）
pnpm cdk deploy FoundationStack X402WeatherStack

# 2. facilitatorのガス代支払い用秘密鍵をSecrets Managerに投入（値はコンソール/CLIから、Gitには含めない）
aws secretsmanager put-secret-value \
  --secret-id agentcore-payments-sample/dev/facilitator-evm-private-key \
  --secret-string '{"EVM_PRIVATE_KEY":"0x..."}'

# 3. 上記「Amazon Bedrock AgentCore Payments のセットアップ」を実施

# 4. Payer側（MCPサーバー）。PAYMENT_MANAGER_ARN等は手順3で取得した値
SELLER_PAYTO_ADDRESS=<受取ウォレット> \
PAYMENT_MANAGER_ARN=<...> PAYMENT_INSTRUMENT_ID=<...> \
PAYMENT_SESSION_ID=<...> PAYMENT_USER_ID=<...> \
pnpm cdk deploy McpStack
```

デプロイ後、`McpStack` の出力 `McpServerUrl` を `claude mcp add --transport http weather-x402 <URL>` に渡せば、AWS上のMCPサーバーに接続できる。**ALBはデフォルトDNS名（カスタムドメインなし）のためHTTP接続になる点に注意**（design.md 7.6節）。

詳細（スタック構成・IAM設計・destroy手順）は [`apps/cdk/README.md`](apps/cdk/README.md) を参照。

## トラブルシューティング

| 症状 | 原因・対処 |
|---|---|
| resource server起動直後の最初のリクエストが500になる | facilitatorの起動と競合するタイムング問題。facilitator起動後にもう一度リクエストすれば解消する |
| `ProcessPayment`が`ValidationException`を返す | Payment Sessionが失効／予算超過。`pnpm payments:admin new-session`で再発行する |
| `ProcessPayment`が認証エラーを返す | 実行環境のAWS認証情報にProcessPaymentRole相当の権限があるか確認する（ローカルなら`aws sts get-caller-identity`で現在のIDを確認） |
| ウォレット残高が0のまま | Payment Instrument作成時の`redirectUrl`で入金・許可操作が完了していない |
| `cdk deploy`がDockerエラーで失敗する | Dockerが起動しているか確認する（`docker info`） |

## 開発コマンド

```bash
pnpm format   # biome format --write .
pnpm check    # biome check --write .（フォーマット+lint）
pnpm knip     # 未使用ファイル・export・依存関係の検出
pnpm jscpd    # コピペ検出
```
