import { decodePaymentRequiredHeader } from "@x402/core/http";
import {
  type AgentCorePaymentConfig,
  processX402Payment,
} from "./processX402Payment.js";

export type PaywallFetchResult<TData = unknown> = {
  data: TData;
  /** 402が発生し、実際にAgentCore Payments経由で決済を行った場合はtrue */
  paymentMade: boolean;
  processPaymentId?: string;
};

/**
 * x402で保護されたリソースを取得する。402が返ってきた場合のみ、
 * Amazon Bedrock AgentCore Payments経由で決済してから再取得する
 * （課金対象の呼び出しは402が返った時の1回のみで、無駄な支払いは発生しない）。
 */
export const fetchWithAgentCorePayment = async <TData = unknown>(
  url: string,
  config: AgentCorePaymentConfig,
  init?: RequestInit,
): Promise<PaywallFetchResult<TData>> => {
  const firstResponse = await fetch(url, init);

  if (firstResponse.status !== 402) {
    if (!firstResponse.ok) {
      throw new Error(
        `リソースの取得に失敗しました: ${firstResponse.status} ${firstResponse.statusText}`,
      );
    }
    return { data: (await firstResponse.json()) as TData, paymentMade: false };
  }

  // 402応答は本文が空で、決済要件（PaymentRequired）は payment-required ヘッダーにbase64/JSONで入っている
  // （@x402/hono の実装で確認済み。response.json()側は空オブジェクトになるため使わない）
  const paymentRequiredHeader = firstResponse.headers.get("payment-required");
  if (!paymentRequiredHeader) {
    throw new Error("402応答に payment-required ヘッダーが含まれていません");
  }
  // ヘッダーをデコードし、支払い要件を確認する。
  const paymentRequired = decodePaymentRequiredHeader(paymentRequiredHeader);
  // x402に対応した支払いのための署名データを作成する。
  const { header, processPaymentId } = await processX402Payment(
    paymentRequired,
    config,
  );

  // 署名データ付きで再度アクセス
  const paidResponse = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers as Record<string, string> | undefined),
      "X-PAYMENT": header,
    },
  });

  if (!paidResponse.ok) {
    const body = await paidResponse.text();
    throw new Error(
      `決済後のリクエストが失敗しました: ${paidResponse.status} ${body}`,
    );
  }

  return {
    data: (await paidResponse.json()) as TData,
    paymentMade: true,
    processPaymentId,
  };
};
