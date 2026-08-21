import "dotenv/config";
import { Receipt } from "mppx";
import { mppx } from "./mppx";
import { account } from "./viem";

/**
 * メイン関数
 */
const main = async () => {
  // リソースパス
  const resourcePath = `${process.env.PAYWALL_API_BASE_URL}/${process.env.PAYWALL_PATH}`;
  // 402で保護されたリソースにアクセスする
  const response = await mppx.fetch(resourcePath, {
    context: {
      account: account,
    },
  });

  console.log("Response Status:", response.status);
  console.log("Payment-Receipt:", response.headers.get("Payment-Receipt"));

  console.log("WWW-Authenticate:", response.headers.get("WWW-Authenticate"));

  console.log("body:", await response.clone().text());

  if (response.headers.has("Payment-Receipt")) {
    const receipt = Receipt.fromResponse(response);

    console.log("Receipt status:", receipt.status);
    console.log("Reference:", receipt.reference);
    console.log("Timestamp:", receipt.timestamp);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
