import { createTestEnvironment } from "@vendure/testing";
import path from "path";
import { afterAll, beforeAll, describe, test } from "vitest";
import { initialData } from "../../../utils/e2e/e2e-initial-data";
import { testConfig } from "../../../utils/e2e/test-config";
import { AssertFunctionShopApi } from "../src/types";
import { UserRegistrationGuardPlugin } from "../src/user-registration-guard.plugin";
import { REGISTER_CUSTOMER } from "./graphql/shop-e2e-definitions";
import { RegisterMutation, RegisterMutationVariables } from "./types/generated-shop-types";

const alwaysTrue: AssertFunctionShopApi = async (ctx, input) => {
  return true;
};

describe("Logical AND", { concurrent: true }, async () => {
  const { server, adminClient, shopClient } = createTestEnvironment({
    ...testConfig(8004),
    plugins: [
      UserRegistrationGuardPlugin.init({
        shop: {
          assert: {
            logicalOperator: "AND",
            functions: [alwaysTrue, alwaysTrue],
          },
        },
        admin: {},
      }),
    ],
  });

  beforeAll(async () => {
    await server.init({
      productsCsvPath: path.join(__dirname, "../../../utils/e2e/e2e-products-full.csv"),
      initialData: initialData,
      customerCount: 2,
    });
  }, 60000);

  afterAll(async () => {
    await server.destroy();
  });

  test("Success for logical AND where the assertions are: [true, true]", async ({ expect }) => {
    const res = await shopClient.query<RegisterMutation, RegisterMutationVariables>(REGISTER_CUSTOMER, {
      input: { emailAddress: "example@example.com" },
    });

    expect(res.registerCustomerAccount.__typename).toStrictEqual("Success");
  });
});
