#!/usr/bin/env tsx
import { randomUUID } from "node:crypto";
import * as readline from "node:readline/promises";
/**
 * Amazon Bedrock AgentCore Payments のセットアップを行う管理者用CLI。
 *
 * design.md 7.2節の4ロール分離モデルに従い、このスクリプトは「人間がTTYで実行する」ことを前提とする
 * （`aws-agents:agents-pay` skillの管理CLI設計を参考にしている）。PaymentManager/Connector/
 * CredentialProviderの作成にはControlPlaneRole相当の権限、Instrument/Sessionの作成には
 * ManagementRole相当の権限を持つAWS認証情報（`aws configure` 済みプロファイル等）が必要。
 *
 * このスクリプト自体はAWS認証情報を保持しない。実行時のAWS SDKデフォルト認証チェーン
 * （環境変数 / 共有プロファイル / SSO等）にすべて委ねる。
 *
 * サブコマンド:
 *   setup-connector     PaymentCredentialProvider(StripePrivy) → PaymentManager → PaymentConnector を作成
 *   create-instrument   Payment Instrument（組み込みウォレット）を作成し、入金用URLを表示
 *   new-session         予算・有効期限付きの Payment Session を作成（TTYでの承認必須）
 *   status              Session残予算 / Instrument残高を確認（読み取り専用）
 */
import {
  BedrockAgentCoreClient,
  CreatePaymentInstrumentCommand,
  CreatePaymentSessionCommand,
  GetPaymentInstrumentBalanceCommand,
  GetPaymentSessionCommand,
} from "@aws-sdk/client-bedrock-agentcore";
import {
  BedrockAgentCoreControlClient,
  CreatePaymentConnectorCommand,
  CreatePaymentCredentialProviderCommand,
  CreatePaymentManagerCommand,
} from "@aws-sdk/client-bedrock-agentcore-control";

const REGION = process.env.AWS_REGION ?? "us-west-2";
const PAYMENT_MANAGER_NAME =
  process.env.PAYMENT_MANAGER_NAME ?? "agentcore-payments-sample-dev";

// コントロール用のクライアントインスタンス
const controlClient = new BedrockAgentCoreControlClient({ region: REGION });
// データ用のクライアントインスタンス
const dataClient = new BedrockAgentCoreClient({ region: REGION });

/**
 * プロンプトを取得するメソッド
 * @param question 
 * @returns 
 */
const prompt = async (question: string): Promise<string> => {
  // 取得
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
};

// 生の制御バイトをソースに埋め込まないよう、文字コードから明示的に組み立てる
const KEY_EOF = String.fromCharCode(4); // Ctrl+D
const KEY_SIGINT = String.fromCharCode(3); // Ctrl+C
const KEY_BACKSPACE = String.fromCharCode(127); // Delete/Backspace

/** 
 * シークレット入力用。ターミナルにエコーせず、入力中は `*` を表示する。
 */
const promptSecret = (question: string): Promise<string> =>
  new Promise((resolve, reject) => {
    process.stdout.write(question);
    const { stdin } = process;
    const isTty = stdin.isTTY === true;
    if (isTty) stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let input = "";
    const cleanup = () => {
      if (isTty) stdin.setRawMode?.(false);
      stdin.pause();
      stdin.removeListener("data", onData);
    };
    const onData = (char: string) => {
      switch (char) {
        case "\n":
        case "\r":
        case KEY_EOF:
          cleanup();
          process.stdout.write("\n");
          resolve(input);
          return;
        case KEY_SIGINT:
          cleanup();
          reject(new Error("入力が中断されました"));
          return;
        case KEY_BACKSPACE:
          input = input.slice(0, -1);
          return;
        default:
          input += char;
          process.stdout.write("*");
      }
    };
    stdin.on("data", onData);
  });

/**
 * `new-session` はTTYでの明示的な `approve` 入力を必須とする。
 * 非対話実行（CI・エージェント経由等）からは絶対に承認できないようにするための意図的なゲート
 * （design.md 7.2節、`aws-agents:agents-pay` skill の管理CLI設計を踏襲）。
 */
const requireTtyApproval = async (summary: string): Promise<void> => {
  if (!process.stdin.isTTY) {
    throw new Error(
      "new-session はTTY（対話的ターミナル）からのみ承認できます。CI・エージェント経由での実行は拒否されます。",
    );
  }
  console.log(summary);
  const answer = await prompt('続行するには "approve" と入力してください: ');
  if (answer !== "approve") {
    throw new Error(
      '承認されませんでした（"approve" 以外の入力）。セッションは作成していません。',
    );
  }
};

const cmdSetupConnector = async (): Promise<void> => {
  const roleArn =
    process.env.RESOURCE_RETRIEVAL_ROLE_ARN ??
    (await prompt(
      "ResourceRetrievalRoleのARN（`cdk deploy FoundationStack` の出力）: ",
    ));
  if (!roleArn) throw new Error("ResourceRetrievalRoleのARNが必要です");

  console.log(
    "\nPrivyダッシュボード（https://dashboard.privy.io/）で発行した資格情報を入力してください。",
  );
  console.log(
    "入力内容はターミナルにエコーされず、このプロセスの外には一切保存されません。\n",
  );

  const appId = await prompt("Privy App ID: ");
  const appSecret = await promptSecret("Privy App Secret: ");
  const authorizationId = await prompt("Privy Authorization ID: ");
  const authorizationPrivateKey = await promptSecret(
    "Privy Authorization Private Key: ",
  );

  console.log("\n1/3 PaymentCredentialProvider を作成しています...");
  const credentialProvider = await controlClient.send(
    new CreatePaymentCredentialProviderCommand({
      name: `${PAYMENT_MANAGER_NAME}-privy-credentials`,
      credentialProviderVendor: "StripePrivy",
      providerConfigurationInput: {
        stripePrivyConfiguration: {
          appId,
          appSecret,
          authorizationId,
          authorizationPrivateKey,
        },
      },
    }),
  );
  console.log(`  -> ${credentialProvider.credentialProviderArn}`);

  console.log("2/3 PaymentManager を作成しています...");
  const manager = await controlClient.send(
    new CreatePaymentManagerCommand({
      name: PAYMENT_MANAGER_NAME,
      authorizerType: "AWS_IAM",
      roleArn,
      clientToken: randomUUID(),
    }),
  );
  console.log(`  -> ${manager.paymentManagerArn}`);

  console.log("3/3 PaymentConnector を作成しています...");
  const connector = await controlClient.send(
    new CreatePaymentConnectorCommand({
      paymentManagerId: manager.paymentManagerId,
      name: `${PAYMENT_MANAGER_NAME}-privy-connector`,
      type: "StripePrivy",
      credentialProviderConfigurations: [
        {
          stripePrivy: {
            credentialProviderArn: credentialProvider.credentialProviderArn,
          },
        },
      ],
      clientToken: randomUUID(),
    }),
  );
  console.log(`  -> ${connector.paymentConnectorId}`);

  console.log(
    "\n完了しました。以下の値を控えてください（README/次のステップで使用します）:",
  );
  console.log(`  PAYMENT_MANAGER_ARN=${manager.paymentManagerArn}`);
  console.log(`  PAYMENT_CONNECTOR_ID=${connector.paymentConnectorId}`);
};

const cmdCreateInstrument = async (): Promise<void> => {
  const paymentManagerArn =
    process.env.PAYMENT_MANAGER_ARN ?? (await prompt("PAYMENT_MANAGER_ARN: "));
  const paymentConnectorId =
    process.env.PAYMENT_CONNECTOR_ID ??
    (await prompt("PAYMENT_CONNECTOR_ID: "));
  const userId =
    process.env.PAYMENT_USER_ID ??
    (await prompt(
      "この決済インストゥルメントの利用者ID（例: 自分のメールアドレス）: ",
    ));
  const email = await prompt(`ウォレット連携用メールアドレス [${userId}]: `);

  const instrument = await dataClient.send(
    new CreatePaymentInstrumentCommand({
      userId,
      paymentManagerArn,
      paymentConnectorId,
      paymentInstrumentType: "EMBEDDED_CRYPTO_WALLET",
      paymentInstrumentDetails: {
        embeddedCryptoWallet: {
          network: "ETHEREUM",
          linkedAccounts: [{ email: { emailAddress: email || userId } }],
        },
      },
      clientToken: randomUUID(),
    }),
  );

  const instrumentDetails =
    instrument.paymentInstrument?.paymentInstrumentDetails;
  const details =
    instrumentDetails && "embeddedCryptoWallet" in instrumentDetails
      ? instrumentDetails.embeddedCryptoWallet
      : undefined;

  console.log("\nPayment Instrument を作成しました:");
  console.log(
    `  PAYMENT_INSTRUMENT_ID=${instrument.paymentInstrument?.paymentInstrumentId}`,
  );
  console.log(`  PAYMENT_USER_ID=${userId}`);
  console.log(
    "\n次のURLをブラウザで開き、テストネットUSDCの入金と、このプロジェクトへの署名権限の許可を行ってください:",
  );
  console.log(
    `  ${details?.redirectUrl ?? "(redirectUrlが返されませんでした。AWSコンソールを確認してください)"}`,
  );
  console.log(
    "\n入金・許可が完了するまで status コマンドで残高が0のままになります。完了後に new-session を実行してください。",
  );
};

const cmdNewSession = async (): Promise<void> => {
  const paymentManagerArn =
    process.env.PAYMENT_MANAGER_ARN ?? (await prompt("PAYMENT_MANAGER_ARN: "));
  const userId =
    process.env.PAYMENT_USER_ID ?? (await prompt("PAYMENT_USER_ID: "));
  const budget =
    process.env.SESSION_BUDGET_USD ??
    (await prompt("このセッションの上限予算（USD、例: 1.00）: "));
  const expiryMinutesInput =
    process.env.SESSION_EXPIRY_MINUTES ??
    (await prompt("有効期限（分、15〜480の範囲。例: 480）: "));
  const expiryTimeInMinutes = Number(expiryMinutesInput);

  if (expiryTimeInMinutes < 15 || expiryTimeInMinutes > 480) {
    throw new Error("有効期限は15〜480分の範囲で指定してください（AWSの制約）");
  }

  await requireTtyApproval(
    "以下の内容でPayment Sessionを作成します:\n" +
      `  PaymentManager: ${paymentManagerArn}\n` +
      `  利用者: ${userId}\n` +
      `  上限予算: $${budget}\n` +
      `  有効期限: ${expiryTimeInMinutes}分`,
  );

  const session = await dataClient.send(
    new CreatePaymentSessionCommand({
      userId,
      paymentManagerArn,
      limits: { maxSpendAmount: { value: budget, currency: "USD" } },
      expiryTimeInMinutes,
      clientToken: randomUUID(),
    }),
  );

  console.log("\nPayment Session を作成しました:");
  console.log(
    `  PAYMENT_SESSION_ID=${session.paymentSession?.paymentSessionId}`,
  );
  console.log(
    "\nこのIDを PAYMENT_SESSION_ID として apps/mcp や apps/x402/client の .env、" +
      "および McpStack デプロイ時の環境変数に設定してください。",
  );
};

const cmdStatus = async (): Promise<void> => {
  const paymentManagerArn =
    process.env.PAYMENT_MANAGER_ARN ?? (await prompt("PAYMENT_MANAGER_ARN: "));
  const sessionId = process.env.PAYMENT_SESSION_ID;
  const instrumentId = process.env.PAYMENT_INSTRUMENT_ID;
  const connectorId = process.env.PAYMENT_CONNECTOR_ID;

  if (sessionId) {
    const { paymentSession } = await dataClient.send(
      new GetPaymentSessionCommand({
        paymentManagerArn,
        paymentSessionId: sessionId,
      }),
    );
    const remaining = paymentSession?.availableLimits?.availableSpendAmount;
    console.log(
      `Session ${sessionId}: 残予算=${remaining ? `${remaining.value} ${remaining.currency}` : "不明"}` +
        ` (expiryTimeInMinutes=${paymentSession?.expiryTimeInMinutes})`,
    );
  }
  if (instrumentId && connectorId) {
    const balance = await dataClient.send(
      new GetPaymentInstrumentBalanceCommand({
        paymentManagerArn,
        paymentConnectorId: connectorId,
        paymentInstrumentId: instrumentId,
        chain: "BASE_SEPOLIA",
        token: "USDC",
      }),
    );
    console.log(
      `Instrument ${instrumentId}: balance=${JSON.stringify(balance.tokenBalance)}`,
    );
  } else if (instrumentId) {
    console.log(
      "PAYMENT_CONNECTOR_ID が未設定のため残高確認をスキップしました。",
    );
  }
  if (!sessionId && !instrumentId) {
    console.log(
      "PAYMENT_SESSION_ID / PAYMENT_INSTRUMENT_ID のいずれも環境変数に設定されていません。",
    );
  }
};

const main = async (): Promise<void> => {
  const [, , subcommand] = process.argv;

  switch (subcommand) {
    case "setup-connector":
      return cmdSetupConnector();
    case "create-instrument":
      return cmdCreateInstrument();
    case "new-session":
      return cmdNewSession();
    case "status":
      return cmdStatus();
    default:
      console.error(
        "使い方: pnpm --filter cdk payments:admin <setup-connector|create-instrument|new-session|status>",
      );
      process.exit(1);
  }
};

main().catch((error) => {
  console.error("エラー:", error instanceof Error ? error.message : error);
  process.exit(1);
});
