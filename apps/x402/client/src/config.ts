import { wrapAxiosWithPayment, x402Client, x402HTTPClient } from "@x402/axios";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import axios from "axios";
import "dotenv/config";
import { signer } from "./viem";

// Create x402 client and register EVM scheme
const client = new x402Client();

client.register("eip155:4801", new ExactEvmScheme(signer));

client.setSpendControls({
  allowedAssets: [
    {
      network: "eip155:4801",
      asset: "0x66145f38cBAC35Ca6F1Dfb4914dF98F1614aeA88",
    },
  ],
});

// Create an Axios instance with payment handling
export const api = wrapAxiosWithPayment(
  axios.create({ baseURL: process.env.PAYWALL_API_BASE_URL }),
  client,
);
// x402 の HTTP クライアントを作成
export const httpClient = new x402HTTPClient(client);
