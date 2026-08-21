import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchWithAgentCorePayment } from "shared";
import { z } from "zod";
import { env } from "../config";

type WeatherResponse = {
  report: {
    weather: string;
    temperature: number;
  };
};

/**
 * get_weather ツールを登録する。
 *
 * モデル（Claude Code）には都市名だけを渡してもらい、支払い可否の判断（許可ネットワーク・
 * 予算上限）はAgentCore Payments側（ProcessPaymentRoleの権限のみを持つこのサーバー）で完結させる。
 * モデルに返すのは天気データと決済メタ情報（決済有無・処理ID）のみで、署名済みプルーフや
 * X-PAYMENTヘッダーの生データは一切返さない。
 */
export const registerGetWeatherTool = (server: McpServer): void => {
  server.registerTool(
    "get_weather",
    {
      title: "天気情報を取得",
      description:
        "x402で保護された天気情報APIから現在の天気を取得する。呼び出しごとにAmazon Bedrock AgentCore Payments経由でUSDC決済が発生する場合がある（$0.01 / 回、Base Sepolia）。",
      inputSchema: {
        city: z.string().min(1).describe("天気を取得したい都市名（例: Tokyo）"),
      },
    },
    async ({ city }) => {
      const url = `${env.PAYWALL_API_BASE_URL}/weather`;

      // x402で保護されたリソースにアクセスする。
      const result = await fetchWithAgentCorePayment<WeatherResponse>(url, {
        region: env.AWS_REGION,
        paymentManagerArn: env.PAYMENT_MANAGER_ARN,
        paymentInstrumentId: env.PAYMENT_INSTRUMENT_ID,
        paymentSessionId: env.PAYMENT_SESSION_ID,
        userId: env.PAYMENT_USER_ID,
      });

      // サマリーをアウトプットとして返す
      const summary = {
        city,
        weather: result.data.report.weather,
        temperature: result.data.report.temperature,
        payment: result.paymentMade
          ? { settled: true, processPaymentId: result.processPaymentId }
          : { settled: false },
      };

      return {
        content: [{ type: "text", text: JSON.stringify(summary) }],
      };
    },
  );
};
