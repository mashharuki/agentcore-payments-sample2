import "dotenv/config";
import { privateKeyToAccount } from "viem/accounts";

// Create a signer from private key (use environment variable)
export const signer = privateKeyToAccount(
  process.env.EVM_PRIVATE_KEY as `0x${string}`,
);
