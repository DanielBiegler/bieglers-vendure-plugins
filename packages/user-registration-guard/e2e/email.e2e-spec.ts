import { createTestEnvironment } from "@vendure/testing";
import path from "path";
import { afterAll, beforeAll, describe, test } from "vitest";
import { initialData } from "../../../utils/e2e/e2e-initial-data";
import { testConfig } from "../../../utils/e2e/test-config";
import { UserRegistrationGuardPlugin } from "../src/user-registration-guard.plugin";
import { blockExampleDotCom } from "./fixtures/assertions";
import { CREATE_ADMIN } from "./graphql/admin-e2e-definitions";
import { REGISTER_CUSTOMER } from "./graphql/shop-e2e-definitions";
import { CreateMutation, CreateMutationVariables } from "./types/generated-admin-types";
import { RegisterMutation, RegisterMutationVariables } from "./types/generated-shop-types";

describe("Email", { concurrent: true }, async () => {
  const { server, adminClient, shopClient } = createTestEnvironment({
    ...testConfig(8001),
    plugins: [
      UserRegistrationGuardPlugin.init({
        shop: {
          assert: {
            logicalOperator: "AND",
            functions: [blockExampleDotCom],
          },
        },
        admin: {
          assert: {
            logicalOperator: "AND",
            functions: [blockExampleDotCom],
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

  test("Successfully block example.com email for customer registration", async ({ expect }) => {
    const res = await shopClient.query<RegisterMutation, RegisterMutationVariables>(REGISTER_CUSTOMER, {
      input: { emailAddress: "example@example.com" },
    });

    expect(res.registerCustomerAccount.__typename).toStrictEqual("NativeAuthStrategyError");
  });

  test("Successfully allow foo.com email for customer registration", async ({ expect }) => {
    const res = await shopClient.query<RegisterMutation, RegisterMutationVariables>(REGISTER_CUSTOMER, {
      input: { emailAddress: "example@foo.com" },
    });

    expect(res.registerCustomerAccount.__typename).toStrictEqual("Success");
  });

  test("Successfully block example.com email at admin creation", async ({ expect }) => {
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

  test("Successfully allow admin.com email at admin creation", async ({ expect }) => {
    const res = await adminClient.query<CreateMutation, CreateMutationVariables>(CREATE_ADMIN, {
      input: {
        emailAddress: "example@admin.com",
        firstName: "",
        lastName: "",
        password: "",
        roleIds: [],
      },
    });

    expect(res.createAdministrator.__typename).toStrictEqual("Administrator");
  });
});
