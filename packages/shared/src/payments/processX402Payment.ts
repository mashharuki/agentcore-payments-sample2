import { randomUUID } from "node:crypto";
import {
  BedrockAgentCoreClient,
  ProcessPaymentCommand,
} from "@aws-sdk/client-bedrock-agentcore";
import { encodePaymentSignatureHeader } from "@x402/core/http";
import type {
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements,
} from "@x402/core/types";

/**
 * Amazon Bedrock AgentCore Payments に接続するための設定。
 * PAYMENT_SESSION_ID / PAYMENT_INSTRUMENT_ID は管理者スクリプト（apps/cdk/scripts/agentcore-payments-admin.ts）
 * で事前に発行したものを固定で読み込む。アプリケーションコード側でセッションを新規作成することはない
 * （ProcessPaymentRoleにはCreatePaymentSession権限を与えていないため、実行しても拒否される）。
 */
export type AgentCorePaymentConfig = {
  region: string;
  paymentManagerArn: string;
  paymentInstrumentId: string;
  paymentSessionId: string;
  userId: string;
};

export type X402PaymentResult = {
  /** x402の再送リクエストに付与する PAYMENT-SIGNATURE ヘッダーの値（x402 v2） */
  header: string;
  /** AgentCore Payments側の決済処理ID（ログ・トラブルシュート用） */
  processPaymentId: string;
};

let cachedClient: BedrockAgentCoreClient | undefined;

/**
 * Amazon Bedrock AgentCore用のクライアントインスタンスを作成する。
 * @param region
 * @returns
 */
const getClient = (region: string): BedrockAgentCoreClient => {
  if (!cachedClient) {
    // クライアントインスタンスを生成
    cachedClient = new BedrockAgentCoreClient({ region });
  }
  return cachedClient;
};

/**
 * x402の402レスポンス（PaymentRequired）を受け取り、Amazon Bedrock AgentCore Payments の
 * ProcessPayment APIで決済プルーフを生成する。
 *
 * 支払い可否（予算超過・セッション失効等）の判断はAgentCore Payments側（AWSサービス）で行われ、
 * このヘルパー自身は判断ロジックを持たない（コードは「言われた通りに1回だけProcessPaymentを呼ぶ」だけ）。
 * 予算超過時はAWS側がエラーを返し、そのままこの関数がエラーをthrowする。
 */
export const processX402Payment = async (
  paymentRequired: PaymentRequired,
  config: AgentCorePaymentConfig,
): Promise<X402PaymentResult> => {
  const requirement: PaymentRequirements | undefined =
    paymentRequired.accepts[0];
  if (!requirement) {
    throw new Error("402レスポンスに accepts[] が含まれていません");
  }

  const client = getClient(config.region);

  // x402に準拠した支払い処理用のデータを作成する実行コマンドを作成
  const command = new ProcessPaymentCommand({
    userId: config.userId,
    paymentManagerArn: config.paymentManagerArn,
    paymentSessionId: config.paymentSessionId,
    paymentInstrumentId: config.paymentInstrumentId,
    paymentType: "CRYPTO_X402",
    paymentInput: {
      cryptoX402: {
        version: String(paymentRequired.x402Version),
        // AWS SDKのDocumentType（任意のJSON値）として渡すため、プレーンなJSON値に変換する
        payload: JSON.parse(JSON.stringify(requirement)),
      },
    },
    clientToken: randomUUID(),
  });

  // レスポンスを取得
  const response = await client.send(command);
  const cryptoOutput = response.paymentOutput?.cryptoX402;

  if (response.status !== "PROOF_GENERATED" || !cryptoOutput?.payload) {
    throw new Error(
      `AgentCore Paymentsでの決済に失敗しました（status: ${response.status ?? "unknown"}）`,
    );
  }

  // ペイメントペイロードデータを作成
  const paymentPayload: PaymentPayload = {
    x402Version: Number(cryptoOutput.version ?? paymentRequired.x402Version),
    accepted: requirement,
    payload: cryptoOutput.payload as Record<string, unknown>,
  };

  // ヘッダーとペイメントIDを返却する
  return {
    header: encodePaymentSignatureHeader(paymentPayload),
    processPaymentId: response.processPaymentId ?? "",
  };
};
