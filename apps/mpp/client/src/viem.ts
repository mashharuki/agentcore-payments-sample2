import "dotenv/config";
import { privateKeyToAccount } from "viem/accounts";

// Signerインスタンスの作成
export const account = privateKeyToAccount(
  process.env.EVM_PRIVATE_KEY as `0x${string}`,
);
