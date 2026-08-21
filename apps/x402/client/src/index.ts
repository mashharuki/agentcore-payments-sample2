import "dotenv/config";
import { fetchWithAgentCorePayment } from "shared";
import { env } from "./config";

type WeatherResponse = {
  report: {
    weather: string;
    temperature: number;
  };
};

/**
 * メインスクリプト
 * x402で保護された /weather を取得する。402が返った場合のみ、
 * Amazon Bedrock AgentCore Payments（ProcessPayment）経由で決済してから再取得する。
 */
const main = async () => {
  const url = `${env.PAYWALL_API_BASE_URL}${env.PAYWALL_PATH}`;

  const result = await fetchWithAgentCorePayment<WeatherResponse>(url, {
    region: env.AWS_REGION,
    paymentManagerArn: env.PAYMENT_MANAGER_ARN,
    paymentInstrumentId: env.PAYMENT_INSTRUMENT_ID,
    paymentSessionId: env.PAYMENT_SESSION_ID,
    userId: env.PAYMENT_USER_ID,
  });

  console.log("Response:", result.data);

  if (result.paymentMade) {
    console.log(
      `AgentCore Payments経由で決済しました（processPaymentId: ${result.processPaymentId}）`,
    );
  } else {
    console.log("402は発生せず、決済なしでリソースを取得しました");
  }
};

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
