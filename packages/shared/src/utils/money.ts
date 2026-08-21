/**
 * USDCの最小単位（atomic units）の桁数。USDCは6桁（1 USDC = 1_000_000 units）。
 */
const USDC_DECIMALS = 6;
const USDC_UNITS_PER_DOLLAR = 10 ** USDC_DECIMALS;

/**
 * ドル建て金額をUSDCのatomic units文字列に変換する（x402のPaymentRequirements.amount等で使用）。
 */
export const dollarsToAtomicUnits = (dollars: number): string => {
  return Math.round(dollars * USDC_UNITS_PER_DOLLAR).toString();
};

/**
 * USDCのatomic units文字列（または数値）をドル建て金額に変換する。
 */
export const atomicUnitsToDollars = (atomicUnits: string | number): number => {
  const units =
    typeof atomicUnits === "string" ? Number(atomicUnits) : atomicUnits;
  return units / USDC_UNITS_PER_DOLLAR;
};
