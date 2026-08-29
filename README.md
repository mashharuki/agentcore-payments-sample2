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

> リージョンは us-west-2で統一してください！

```bash
pnpm cdk run deploy 'FoundationStack'
```

出力される `ResourceRetrievalRoleArn` を控える（次のステップで使う）。

### 3. PaymentManager / PaymentConnector の作成

```bash
cd apps/cdk
RESOURCE_RETRIEVAL_ROLE_ARN=<手順2で控えたARN> pnpm payments:admin setup-connector
```

Privyの資格情報（App ID / App Secret / Authorization ID / Authorization Private Key）の入力を求められる。入力はターミナルにエコーされず、このプロセスの外には保存されない。完了すると `PAYMENT_MANAGER_ARN` と `PAYMENT_CONNECTOR_ID` が表示されるので控える。

### 4. Payment Instrument（ウォレット）の作成・入金・署名権限の付与

```bash
PAYMENT_MANAGER_ARN=<手順3のARN> PAYMENT_CONNECTOR_ID=<手順3のID> pnpm payments:admin create-instrument
```

利用者ID（自分のメールアドレス等）とウォレット連携用メールアドレスを入力すると `PAYMENT_INSTRUMENT_ID` が表示される。

**このプロジェクトは Stripe (Privy) コネクタを使うため、Coinbase のような「開くだけ」のホスト済み `redirectUrl` は返ってこない**（`create-instrument` は `(redirectUrlが返されませんでした…)` と表示する。これは仕様）。入金と署名権限の付与は、Privy のリファレンスフロントエンド（Next.js）をローカル起動して行う（[AWS公式手順](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/payments-fund-wallet.html)）。

```bash
git clone https://github.com/privy-io/aws-agentcore-sdk.git
cd aws-agentcore-sdk
```

`.env.local` を作成する（値は手順3で `setup-connector` に入力したものと同じ）:

```bash
NEXT_PUBLIC_PRIVY_APP_ID=<Privy App ID>
PRIVY_APP_SECRET=<Privy App Secret>
NEXT_PUBLIC_PRIVY_SIGNER_ID=<Privy Authorization ID（Key ID。公開識別子なのでクライアント露出可）>
NEXT_PUBLIC_NETWORK_MODE=testnet
```

1. Privy ダッシュボード **App Settings > Basics > Domains** に `http://localhost:3000` を許可（allowlist）
2. `pnpm install && pnpm dev` → `http://localhost:3000` を開く
3. **`create-instrument` で指定したウォレット連携用メールアドレスと同じもの**でログイン（ログイン時に Base / Solana の埋め込みウォレットが自動生成される）
4. **入金**: 画面に表示されるウォレットアドレスを [Circle faucet](https://faucet.circle.com/) の **Base Sepolia** に貼り、testnet USDC を受け取る
5. **署名権限の許可（delegation）**: ホーム画面の「Connect agent」→「Give access」。Authorization ID がウォレットの session signer として登録される

入金と署名権限の付与の両方が完了するまで `PAYMENT_INSTRUMENT_ID` の残高は0のまま（`ProcessPayment` も失敗する）。完了後、`pnpm payments:admin status` で残高を確認できる。

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

### 2-1. `apps/mcp/.env` を用意する

ゴール①で動いた `apps/x402/client/.env` をそのまま流用できる（`PAYWALL_PATH` は余分だが無視される。`PORT` 省略時は 4024）:

```bash
cp apps/x402/client/.env apps/mcp/.env
```

または手動で（`apps/mcp/.env.example` 参照）:

```bash
AWS_REGION=us-west-2
PAYMENT_MANAGER_ARN=<ゴール①と同じ>
PAYMENT_INSTRUMENT_ID=<ゴール①と同じ>
PAYMENT_SESSION_ID=<ゴール①と同じ（失効していたら new-session で再発行）>
PAYMENT_USER_ID=<ゴール①と同じ>
PAYWALL_API_BASE_URL=http://localhost:4021
PORT=4024
```

### 2-2. 3サービスを起動する（別ターミナル各1つ）

```bash
pnpm x402server dev     # :4021 リソースサーバー
pnpm facilitator dev    # :4022 決済の検証・オンチェーン実行
pnpm mcp dev            # :4024 MCPサーバー（get_weather ツール）
```

### 2-3. Claude Code を使わず疎通確認だけしたい場合

```bash
pnpm --filter mcp call            # get_weather を1回呼ぶ（WEATHER_CITY で都市指定可）
```

`{"city":"Tokyo","weather":"sunny","temperature":70,"payment":{"settled":true,"processPaymentId":"..."}}` が返れば、
MCP → x402（402）→ AgentCore Payments（ProcessPayment）→ facilitator によるオンチェーン決済（Base Sepolia の USDC $0.01）→ 天気データ返却、まで一気通貫で動いている。

### 2-4. Claude Code に接続する

`apps/mcp/.mcp.example.json` にこの MCP サーバーの定義（`x402-weather` → `http://localhost:4024/mcp`）がある。いずれかの方法で登録する:

```bash
# 方法A: リポジトリ直下の .mcp.json として使う（Claude Code が自動検出。要承認）
cp apps/mcp/.mcp.example.json .mcp.json

# 方法B: CLI で追加する
claude mcp add --transport http x402-weather http://localhost:4024/mcp
```

`claude mcp list` で `x402-weather` を確認する（`⏸ Pending approval` の場合は Claude Code 上で承認 → health check が通る）。

承認後、Claude Code から `get_weather`（`mcp__x402-weather__get_weather`）を呼び出すと、内部で AgentCore Payments 経由の決済が行われ、天気データと決済メタ情報（`processPaymentId`）が返る。署名済みプルーフや `PAYMENT-SIGNATURE` ヘッダーの生データはモデルには渡らない。

> スタンドアロンの **Claude Desktop アプリ**（Claude Code ではない方）から使う場合は、`claude_desktop_config.json` にローカル HTTP を橋渡しする `mcp-remote` を設定する:
> ```json
> { "mcpServers": { "x402-weather": {
>   "command": "npx",
>   "args": ["-y", "mcp-remote", "http://localhost:4024/mcp", "--allow-http"]
> } } }
> ```

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

## ライセンス

[MIT](./LICENSE)


## x402によるステーブルコイン決済の記録

[BaseScan - 0x64d08bb4071635890366ade57daba52c75a9a6fe3e5202a87b706df42edb78e0](https://sepolia.basescan.org/tx/0x64d08bb4071635890366ade57daba52c75a9a6fe3e5202a87b706df42edb78e0)