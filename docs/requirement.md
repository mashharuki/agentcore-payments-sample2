# 要件定義書

# AgentCore payments

## このプログラムの目的
- Amazon Bedrock AgentCore paymentsがGAされたので徹底的にマスターしたい
- x402のほか、mppにも対応しているとのことだが、まずはx402を使った場合をマスターしたい
	- mppはx402版のコードがちゃんと動いてから後で試す。
		- サンプル用のコードは先行して作っておいています(サーバーとクライアント)。
- 天気予報の情報をx402で取得できるようにしたい。
	- /weather 0.01
- Wallet ProviderにはPrivyを使いたい
- 最終的に以下の2点を達成したい
	- x402用のクライアントでx402決済が達成できること
	- Claude CodeからMCP経由でx402決済が達成できること
- 作った後にユーザーがつまづくことなくシステムを動かせるようにREADMEの内容は丁寧かつ網羅的に作り込むこと
- CDKスタックについてはベストプラクティスに従って作成すること
	- 論理IDや各サービスのオプションは外出しして簡単に切り替えられるようにすること
- CDKスタックについてはロググループも含めてdestroyコマンドで全てのリソースが削除できるようにすること
- 再デプロイしようとした時にエラーが発生しないようにCDKスタックを設計すること
- 必要に応じてSKILLやMCP、サブエージェントの利用を積極的に活用すること
- コードにはわかりやすいコメントを日本語で挿入すること
- 基本的なコードはこちらで用意しているのでこれをベースに実装を進めてください。
- drawioを使って非常に綺麗なシステムアーキテクチャを作成すること
- 設計書についてはmemaid記法も使いながら処理シーケンス図などをわかりやすく記載すること
- 採用したAWSのサービス一覧をまとめること
## 作りたいシステムの要件
- pnpm
- typescript
- biome
- jscpd
- knip
- モノレポ構成
	- apps 配下
		- x402のバックエンドサーバー
			- hono
			- x402
		- MCPサーバー
			- modelcontextprovider SDK
		- CDK
			- cdk-nag
		- 検証用のx402クライアントスクリプト
			- x402
		- mppのバックエンドサーバー
			- hono
			- mppx
		- 検証用のmppクライアントスクリプト
			- mppx
		- 検証用のファシリテーター
			- 標準では対応していない world sepoliaに対応させたもの
			- 動くことは確認ずみ
	- shared 配下
		- ユーティリティメソッド
		- バリデーション
			- zod
- base sepolia テストネット
	- テストネット用のUSDCについては既に取得済み

## 参考文献

- https://github.com/aws/agent-toolkit-for-aws/tree/main/plugins/aws-agents/skills/agents-pay
- https://aws.amazon.com/jp/blogs/machine-learning/amazon-bedrock-agentcore-payments-is-now-generally-available-enabling-agents-to-transact-safely-and-autonomously-at-scale/
- https://github.com/awslabs/agentcore-samples/tree/main/01-features/08-agents-that-transact/01-payments-skills-and-cli
- https://github.com/awslabs/agentcore-samples/blob/main/01-features/08-agents-that-transact/00-getting-started/01-agents-payments-and-limits/strands_payment_agent.py
- https://github.com/langchain-samples/langchain-aws-samples/tree/main/examples/agentcore-payments
- https://github.com/awslabs/agentcore-samples/blob/main/01-features/08-agents-that-transact/00-getting-started/01-agents-payments-and-limits/langgraph_payment_agent.py
- https://github.com/awslabs/agentcore-samples/tree/main/01-features/08-agents-that-transact/01-payments-skills-and-cli/converse-with-openclaw-agent/
- https://clawhub.ai/aws/plugins/aws-agents-pay
- https://github.com/awslabs/agentcore-samples/tree/main/01-features/08-agents-that-transact
- https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/payments.html
- https://developers.openai.com/cookbook/examples/partners/aws/controlled_agentic_commerce_with_agentcore_payments/controlled_agentic_commerce
- https://x402.org/
- https://github.com/x402-foundation/x402
- https://docs.x402.org/getting-started/quickstart-for-buyers#fetch
- https://github.com/x402-foundation/x402/tree/main/examples/typescript/clients/fetch
- https://docs.x402.org/getting-started/quickstart-for-sellers
- https://docs.x402.org/dev-tools/facilitators
- https://github.com/x402-foundation/x402/tree/main/examples/typescript/servers/self-facilitation
- https://github.com/br-to/jpyc-x402-facilitator/tree/main
- https://zenn.dev/komlock_lab/articles/d4cc55a2ecf543
- https://github.com/x402-foundation/x402/tree/main/examples/typescript/clients/fetch