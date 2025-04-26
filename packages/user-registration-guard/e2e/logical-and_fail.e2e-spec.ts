import { createTestEnvironment } from "@vendure/testing";
import path from "path";
import { afterAll, beforeAll, describe, test } from "vitest";
import { initialData } from "../../../utils/e2e/e2e-initial-data";
import { testConfig } from "../../../utils/e2e/test-config";
import { AssertFunctionShopApi } from "../src/types";
import { UserRegistrationGuardPlugin } from "../src/user-registration-guard.plugin";
import { CREATE_ADMIN } from "./graphql/admin-e2e-definitions";
import { REGISTER_CUSTOMER } from "./graphql/shop-e2e-definitions";
import { CreateMutation, CreateMutationVariables } from "./types/generated-admin-types";
import { RegisterMutation, RegisterMutationVariables } from "./types/generated-shop-types";

const alwaysTrue: AssertFunctionShopApi = async (ctx, input) => {
  return { isAllowed: true };
};

const alwaysFalse: AssertFunctionShopApi = async (ctx, input) => {
  return { isAllowed: false };
};

describe("Logical AND", { concurrent: true }, async () => {
  const { server, adminClient, shopClient } = createTestEnvironment({
    ...testConfig(8003),
    plugins: [
      UserRegistrationGuardPlugin.init({
        shop: {
          assert: {
            logicalOperator: "AND",
            functions: [alwaysTrue, alwaysFalse],
          },
        },
        admin: {
          assert: {
            logicalOperator: "AND",
            functions: [alwaysTrue, alwaysFalse],
          },
        },
      }),
    ],
  });

  beforeAll(async () => {
    await server.init({
      productsCsvPath: path.join(__dirname, "../../../utils/e2e/e2e-products-full.csv"),
      initialData: initialData,
      customerCount: 2,
    });
    await adminClient.asSuperAdmin();
  }, 60000);

  afterAll(async () => {
    await server.destroy();
  });

  test("Fail due to logical AND where the assertions are: [true, false] for customers", async ({ expect }) => {
    const res = await shopClient.query<RegisterMutation, RegisterMutationVariables>(REGISTER_CUSTOMER, {
      input: { emailAddress: "example@example.com" },
    });

    expect(res.registerCustomerAccount.__typename).toStrictEqual("NativeAuthStrategyError");
  });

  test("Fail due to logical AND where the assertions are: [true, false] for admins", async ({ expect }) => {
    const res = adminClient.query<CreateMutation, CreateMutationVariables>(CREATE_ADMIN, {
      input: {
        emailAddress: "example@example.com",
        firstName: "",
        lastName: "",
        password: "",
        roleIds: [],
      },
    });

    await expect(res).rejects.toThrow("NativeAuthStrategyError");
  });
});
