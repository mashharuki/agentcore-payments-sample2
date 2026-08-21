import { RetentionDays } from "aws-cdk-lib/aws-logs";
import type { AppConfig, ServiceConfig } from "../../lib/config/app-config";

const baseServiceConfig = (
  overrides: Partial<ServiceConfig> &
    Pick<ServiceConfig, "logicalId" | "serviceName" | "containerPort">,
): ServiceConfig => ({
  cpu: 256,
  memoryLimitMiB: 512,
  healthCheckPath: "/health",
  desiredCount: 1,
  logRetention: RetentionDays.ONE_WEEK,
  ...overrides,
});

export const testAppConfig: AppConfig = {
  envName: "dev",
  region: "us-west-2",
  paymentManagerName: "test-payment-manager",
  sellerPayToAddress: "0x0000000000000000000000000000000000000001",
  resourceServer: baseServiceConfig({
    logicalId: "X402ResourceServer",
    serviceName: "x402-resource-server-test",
    containerPort: 4021,
  }),
  facilitator: baseServiceConfig({
    logicalId: "X402Facilitator",
    serviceName: "x402-facilitator-test",
    containerPort: 4022,
  }),
  mcpServer: baseServiceConfig({
    logicalId: "McpServer",
    serviceName: "mcp-server-test",
    containerPort: 4024,
  }),
  runtimePayment: {
    instrumentId: "payment-instrument-test",
    sessionId: "payment-session-test",
    userId: "test-user",
  },
};
