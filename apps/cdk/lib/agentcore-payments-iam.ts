import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";

/**
 * Amazon Bedrock AgentCore Payments が定める4ロール分離モデルを構築する。
 * 「予算を作れる者（ManagementRole）」と「予算を使い切れる者（ProcessPaymentRole）」を
 * IAMレベルで分離するのがこの設計の核心（design.md 7.2節、AWS公式ドキュメント準拠）。
 *
 * 参考: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/payments-iam-roles.html
 */
export type AgentCorePaymentsIamRoles = {
  /** 管理者（人間）がPaymentManager/Connector/CredentialProviderを作成するためのロール */
  readonly controlPlaneRole: iam.Role;
  /** 開発者（人間、決定的なコード経由）がInstrument/Sessionを作成するためのロール。ProcessPaymentは明示Deny */
  readonly managementRole: iam.Role;
  /** apps/mcp 等、エージェント実行環境がProcessPaymentのみを呼び出すためのロール */
  readonly processPaymentRole: iam.Role;
  /** AgentCore Payments自身が資格情報取得のために引き受けるサービスロール */
  readonly resourceRetrievalRole: iam.Role;
};

const paymentManagerArnPattern = (scope: Construct): string =>
  cdk.Arn.format(
    {
      service: "bedrock-agentcore",
      resource: "payment-manager",
      resourceName: "*",
      region: "*",
      account: cdk.Stack.of(scope).account,
    },
    cdk.Stack.of(scope),
  );

const tokenVaultArnPattern = (scope: Construct): string =>
  cdk.Arn.format(
    {
      service: "bedrock-agentcore",
      resource: "token-vault",
      resourceName: "*/paymentcredentialprovider/*",
      region: "*",
      account: cdk.Stack.of(scope).account,
    },
    cdk.Stack.of(scope),
  );

export const createAgentCorePaymentsIamRoles = (
  scope: Construct,
  paymentManagerName: string,
): AgentCorePaymentsIamRoles => {
  const stack = cdk.Stack.of(scope);
  const paymentManagerArn = paymentManagerArnPattern(scope);
  // アカウントのroot主体からのAssumeRoleを許可する（人間が `aws sts assume-role` して使う想定）
  const accountRootPrincipal = new iam.AccountRootPrincipal();

  // ========================================
  // ResourceRetrievalRole
  // AgentCore Payments (bedrock-agentcore.amazonaws.com) が引き受けるサービスロール。
  // 基本権限・コネクタごとの権限はPaymentManager/Connector作成時にAWS側が自動付与するため、
  // ここでは信頼ポリシーのみを用意する。
  // ========================================
  const resourceRetrievalRole = new iam.Role(scope, "ResourceRetrievalRole", {
    roleName: `${paymentManagerName}-resource-retrieval-role`,
    assumedBy: new iam.PrincipalWithConditions(
      new iam.ServicePrincipal("bedrock-agentcore.amazonaws.com"),
      {
        StringEquals: { "aws:SourceAccount": stack.account },
        ArnLike: {
          // CreatePaymentManager が返す ARN のリソース部分は、名前ベース
          // （`<name>-<suffix>`）とも AWS 生成 ID（`paymentmanager-xxxx`）とも取れる形が
          // 混在しており、`${paymentManagerName}-*` に絞ると環境によって信頼ポリシーが
          // 一致せず role validation に失敗する。account + region + サービスまでで
          // confused deputy を防ぎ、payment-manager 配下はワイルドカードにする。
          "aws:SourceArn": cdk.Arn.format(
            {
              service: "bedrock-agentcore",
              resource: "payment-manager",
              resourceName: "*",
              region: stack.region,
              account: stack.account,
            },
            stack,
          ),
        },
      },
    ),
  });

  // ========================================
  // ControlPlaneRole（管理者）
  // PaymentManager / Connector / CredentialProvider の作成・削除
  // ========================================
  const controlPlaneRole = new iam.Role(scope, "ControlPlaneRole", {
    roleName: `${paymentManagerName}-control-plane-role`,
    assumedBy: accountRootPrincipal,
  });
  controlPlaneRole.addToPolicy(
    new iam.PolicyStatement({
      sid: "AllowPaymentManagerOperations",
      actions: [
        "bedrock-agentcore:CreatePaymentManager",
        "bedrock-agentcore:GetPaymentManager",
        "bedrock-agentcore:ListPaymentManagers",
        "bedrock-agentcore:DeletePaymentManager",
        "bedrock-agentcore:UpdatePaymentManager",
        "bedrock-agentcore:AllowVendedLogDeliveryForResource",
      ],
      resources: [paymentManagerArn],
    }),
  );
  controlPlaneRole.addToPolicy(
    new iam.PolicyStatement({
      sid: "AllowPaymentConnectorOperations",
      actions: [
        "bedrock-agentcore:CreatePaymentConnector",
        "bedrock-agentcore:GetPaymentConnector",
        "bedrock-agentcore:ListPaymentConnectors",
        "bedrock-agentcore:DeletePaymentConnector",
        "bedrock-agentcore:UpdatePaymentConnector",
      ],
      resources: [`${paymentManagerArn}/connector/*`],
    }),
  );
  controlPlaneRole.addToPolicy(
    new iam.PolicyStatement({
      sid: "AllowCredentialProviderOperations",
      actions: [
        "bedrock-agentcore:CreatePaymentCredentialProvider",
        "bedrock-agentcore:GetPaymentCredentialProvider",
        "bedrock-agentcore:ListPaymentCredentialProviders",
        "bedrock-agentcore:DeletePaymentCredentialProvider",
        "bedrock-agentcore:UpdatePaymentCredentialProvider",
      ],
      resources: [tokenVaultArnPattern(scope)],
    }),
  );
  controlPlaneRole.addToPolicy(
    new iam.PolicyStatement({
      sid: "AllowPassResourceRetrievalRole",
      actions: ["iam:PassRole"],
      resources: [resourceRetrievalRole.roleArn],
      conditions: {
        StringEquals: {
          "iam:PassedToService": "bedrock-agentcore.amazonaws.com",
        },
      },
    }),
  );

  // ========================================
  // ManagementRole（開発者、決定的なコード経由）
  // Instrument / Session の作成・管理。ProcessPaymentは明示的にDenyする
  // （予算を作れる者が予算を使い切れないようにする、このモデルの核心）
  // ========================================
  const managementRole = new iam.Role(scope, "ManagementRole", {
    roleName: `${paymentManagerName}-management-role`,
    assumedBy: accountRootPrincipal,
  });
  managementRole.addToPolicy(
    new iam.PolicyStatement({
      sid: "AllowPaymentManagement",
      actions: [
        "bedrock-agentcore:CreatePaymentInstrument",
        "bedrock-agentcore:GetPaymentInstrument",
        "bedrock-agentcore:ListPaymentInstruments",
        "bedrock-agentcore:DeletePaymentInstrument",
        "bedrock-agentcore:GetPaymentInstrumentBalance",
        "bedrock-agentcore:CreatePaymentSession",
        "bedrock-agentcore:GetPaymentSession",
        "bedrock-agentcore:ListPaymentSessions",
        "bedrock-agentcore:DeletePaymentSession",
      ],
      resources: [paymentManagerArn],
    }),
  );
  managementRole.addToPolicy(
    new iam.PolicyStatement({
      sid: "DenyProcessPayment",
      effect: iam.Effect.DENY,
      actions: ["bedrock-agentcore:ProcessPayment"],
      resources: ["*"],
    }),
  );

  // ========================================
  // ProcessPaymentRole（エージェント実行環境。apps/mcpのECSタスクロールに使う）
  // ProcessPaymentの実行と読み取り専用操作のみ。CreatePaymentSession等の書き込み系は含めない
  // （含めてしまうと予算超過時に自分でセッションを作り直して制限を回避できてしまう）
  // ========================================
  const processPaymentRole = new iam.Role(scope, "ProcessPaymentRole", {
    roleName: `${paymentManagerName}-process-payment-role`,
    assumedBy: new iam.CompositePrincipal(
      accountRootPrincipal,
      new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    ),
  });
  processPaymentRole.addToPolicy(
    new iam.PolicyStatement({
      sid: "AllowProcessPayment",
      actions: ["bedrock-agentcore:ProcessPayment"],
      resources: [paymentManagerArn],
    }),
  );
  processPaymentRole.addToPolicy(
    new iam.PolicyStatement({
      sid: "AllowPaymentReadOperations",
      actions: [
        "bedrock-agentcore:GetPaymentInstrument",
        "bedrock-agentcore:GetPaymentInstrumentBalance",
        "bedrock-agentcore:GetPaymentSession",
      ],
      resources: [paymentManagerArn],
    }),
  );

  return {
    controlPlaneRole,
    managementRole,
    processPaymentRole,
    resourceRetrievalRole,
  };
};
