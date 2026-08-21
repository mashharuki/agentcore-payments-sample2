import { z } from "zod";

/**
 * zodスキーマに対してprocess.envを検証し、失敗した場合は分かりやすいエラーを投げる。
 */
export const loadEnv = <TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  env: NodeJS.ProcessEnv = process.env,
): z.infer<TSchema> => {
  const result = schema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`環境変数の検証に失敗しました:\n${issues}`);
  }
  return result.data;
};

const evmAddressSchema = z
  .string()
  .regex(
    /^0x[a-fA-F0-9]{40}$/,
    "EVMアドレス（0x + 40桁の16進数）である必要があります",
  );
const evmPrivateKeySchema = z
  .string()
  .regex(
    /^0x[a-fA-F0-9]{64}$/,
    "EVM秘密鍵（0x + 64桁の16進数）である必要があります",
  );

/** apps/x402/server の環境変数スキーマ */
export const resourceServerEnvSchema = z.object({
  FACILITATOR_URL: z.url(),
  EVM_ADDRESS: evmAddressSchema,
  PORT: z.coerce.number().int().positive().default(4021),
});
export type ResourceServerEnv = z.infer<typeof resourceServerEnvSchema>;

/** apps/x402/facilitator の環境変数スキーマ */
export const facilitatorEnvSchema = z.object({
  EVM_PRIVATE_KEY: evmPrivateKeySchema,
  PORT: z.coerce.number().int().positive().default(4022),
});
export type FacilitatorEnv = z.infer<typeof facilitatorEnvSchema>;

/**
 * AgentCore Payments を使ってx402決済を実行する側（apps/x402/client, apps/mcp）に共通する環境変数。
 */
export const agentCorePaymentEnvSchema = z.object({
  AWS_REGION: z.string().min(1),
  PAYMENT_MANAGER_ARN: z.string().startsWith("arn:aws:bedrock-agentcore:"),
  PAYMENT_INSTRUMENT_ID: z.string().min(1),
  PAYMENT_SESSION_ID: z.string().min(1),
  PAYMENT_USER_ID: z.string().min(1),
  PAYWALL_API_BASE_URL: z.url(),
});
export type AgentCorePaymentEnv = z.infer<typeof agentCorePaymentEnvSchema>;

/** apps/x402/client の環境変数スキーマ */
export const x402ClientEnvSchema = agentCorePaymentEnvSchema.extend({
  PAYWALL_PATH: z.string().startsWith("/"),
});
export type X402ClientEnv = z.infer<typeof x402ClientEnvSchema>;

/** apps/mcp の環境変数スキーマ */
export const mcpServerEnvSchema = agentCorePaymentEnvSchema.extend({
  PORT: z.coerce.number().int().positive().default(4024),
});
export type McpServerEnv = z.infer<typeof mcpServerEnvSchema>;
