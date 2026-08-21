/**
 * CAIP-2形式のEVMチェーンID（例: "eip155:84532"）。
 */
export type Caip2EvmChainId = `eip155:${number}`;

/**
 * チェーンID（数値）からCAIP-2形式の文字列を組み立てる。
 */
export const buildEip155ChainId = (chainId: number): Caip2EvmChainId =>
  `eip155:${chainId}`;

/**
 * CAIP-2形式の文字列（"eip155:<chainId>"）からチェーンIDを取り出す。
 * 不正な形式の場合はエラーを投げる。
 */
export const parseEip155ChainId = (caip2: string): number => {
  const [namespace, reference] = caip2.split(":");
  if (namespace !== "eip155" || !reference) {
    throw new Error(
      `不正なCAIP-2チェーンIDです（"eip155:<chainId>"形式である必要があります）: ${caip2}`,
    );
  }

  const chainId = Number(reference);
  if (!Number.isInteger(chainId)) {
    throw new Error(`CAIP-2チェーンIDの参照部分が整数ではありません: ${caip2}`);
  }

  return chainId;
};
