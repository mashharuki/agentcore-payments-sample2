import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { FoundationStack } from "../lib/foundation-stack";
import { testAppConfig } from "./fixtures/test-app-config";

describe("FoundationStack", () => {
  const app = new cdk.App();
  const stack = new FoundationStack(app, "TestFoundationStack", {
    env: { account: "123456789012", region: "us-west-2" },
    appConfig: testAppConfig,
  });
  const template = Template.fromStack(stack);

  it("should create a VPC without NAT gateways when cost-optimized public-only subnets are configured", () => {
    template.resourceCountIs("AWS::EC2::NatGateway", 0);
  });

  it("should deny bedrock-agentcore:ProcessPayment on the ManagementRole", () => {
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: "Deny",
            Action: "bedrock-agentcore:ProcessPayment",
          }),
        ]),
      }),
    });
  });

  it("should not grant CreatePaymentSession to the ProcessPaymentRole", () => {
    const policies = template.findResources("AWS::IAM::Policy");
    const processPaymentRolePolicies = Object.values(policies).filter(
      (resource) => JSON.stringify(resource).includes("AllowProcessPayment"),
    );

    expect(processPaymentRolePolicies.length).toBeGreaterThan(0);
    for (const resource of processPaymentRolePolicies) {
      expect(JSON.stringify(resource)).not.toContain("CreatePaymentSession");
    }
  });

  it("should create the facilitator signing key secret with a destroy removal policy", () => {
    template.hasResource("AWS::SecretsManager::Secret", {
      DeletionPolicy: "Delete",
    });
  });
});
