import { toFacilitatorEvmSigner } from "@x402/evm";
import dotenv from "dotenv";
import { facilitatorEnvSchema, loadEnv } from "shared";
import { type Chain, createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

dotenv.config();

// ========================================
// Validate environment variables
// ========================================

export const env = loadEnv(facilitatorEnvSchema);

// ========================================
// EVM
// ========================================

export const evmAccount = privateKeyToAccount(
  env.EVM_PRIVATE_KEY as `0x${string}`,
);

console.info(`EVM Facilitator account: ${evmAccount.address}`);

// baseSepolia（対応ネットワークはBase Sepoliaのみ）
export const baseSepoliaChainInfo = {
  chain: baseSepolia,
  chainId: "eip155:84532",
};

/**
 * 指定したチェーンのVeim クライアントを返すメソッド
 * @param chain
 */
export const getViemClientForChain = (chain: Chain) => {
  return createWalletClient({
    account: evmAccount,
    chain,
    transport: http(),
  }).extend(publicActions);
};

/**
 * チェーンごとのFacilitator EVM signerを返すメソッド
 * @param viemClient チェーンごとのViemクライアント
 */
export const getFacilitatorEvmSignerForChain = (viemClient: any) => {
  return toFacilitatorEvmSigner({
    getCode: (args: { address: `0x${string}` }) => viemClient.getCode(args),

    address: evmAccount.address,

    readContract: (args: {
      address: `0x${string}`;
      abi: readonly unknown[];
      functionName: string;
      args?: readonly unknown[];
    }) =>
      viemClient.readContract({
        ...args,
        args: args.args ?? [],
      }),

    verifyTypedData: (args: {
      address: `0x${string}`;
      domain: Record<string, unknown>;
      types: Record<string, unknown>;
      primaryType: string;
      message: Record<string, unknown>;
      signature: `0x${string}`;
    }) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      viemClient.verifyTypedData(args as any),

    writeContract: (args: {
      address: `0x${string}`;
      abi: readonly unknown[];
      functionName: string;
      args: readonly unknown[];
    }) =>
      viemClient.writeContract({
        ...args,
        args: args.args ?? [],
      }),

    sendTransaction: (args: { to: `0x${string}`; data: `0x${string}` }) =>
      viemClient.sendTransaction(args),

    waitForTransactionReceipt: (args: { hash: `0x${string}` }) =>
      viemClient.waitForTransactionReceipt(args),
  });
};
