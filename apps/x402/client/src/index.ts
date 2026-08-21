import "dotenv/config";
import { api, httpClient } from "./config";

/**
 * メインスクリプト
 */
const main = async () => {
  // Make request - payment is handled automatically
  const response = await api.get(process.env.PAYWALL_PATH);

  console.log("status:", response.status);
  console.log("headers:", response.headers);
  console.dir(response.data, { depth: null });

  // Parse the payment result (status, body, and decoded payment header)
  const result = httpClient.parsePaymentResult({
    status: response.status,
    getHeader: (name: string) => response.headers[name.toLowerCase()],
    body: response.data,
  });

  console.log("Response:", result.body);

  if (result.paymentStatus === "settled") {
    console.log("Payment settled:", result.header);
  } else if (result.paymentStatus === "settle_failed") {
    console.error("Settlement failed:", result.header);
  }
};

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
