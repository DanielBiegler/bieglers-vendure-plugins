import { UserService } from "@vendure/core";
import { createTestEnvironment } from "@vendure/testing";
import path from "path";
import { afterAll, assert, beforeAll, describe, test } from "vitest";
import { initialData } from "../../../utils/e2e/e2e-initial-data";
import { testConfig } from "../../../utils/e2e/test-config";
import { AssertFunctionShopApi } from "../src";
import { UserRegistrationGuardPlugin } from "../src/user-registration-guard.plugin";
import { CREATE_ADMIN } from "./graphql/admin-e2e-definitions";
import { REGISTER_CUSTOMER } from "./graphql/shop-e2e-definitions";
import { CreateMutation, CreateMutationVariables } from "./types/generated-admin-types";
import { RegisterMutation, RegisterMutationVariables } from "./types/generated-shop-types";

/**
 * NOTE:
 * I am aware that this suite tests implementation details but this package shouldn't change much,
 * so I just want to make sure we throw in case I do an oopsy-daisy and remove it sometime in the future.
 */

const arbitraryInjectorTest: AssertFunctionShopApi = async (ctx, args, injector) => {
  const service = injector.get(UserService);
  // Should be superadmin
  const firstUser = await service.getUserById(ctx, "1");

  assert(firstUser?.identifier === "superadmin");

  return { isAllowed: true };
};

describe("Injector", { concurrent: true }, async () => {
  const { server, adminClient, shopClient } = createTestEnvironment({
    ...testConfig(8009),
    plugins: [
      UserRegistrationGuardPlugin.init({
        shop: {
          assert: {
            logicalOperator: "AND",
            functions: [arbitraryInjectorTest],
          },
        },
        admin: {
          assert: {
            logicalOperator: "AND",
            functions: [arbitraryInjectorTest],
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

  test("Successfully allow if UserService returns SuperAdmin for customers", async ({ expect }) => {
    const res = await shopClient.query<RegisterMutation, RegisterMutationVariables>(REGISTER_CUSTOMER, {
      input: { emailAddress: "example@example.com" },
    });

    expect(res.registerCustomerAccount.__typename).toStrictEqual("Success");
  });

  test("Successfully allow if UserService returns SuperAdmin, for admins", async ({ expect }) => {
    const res = await adminClient.query<CreateMutation, CreateMutationVariables>(CREATE_ADMIN, {
      input: {
        emailAddress: "example@example.com",
        firstName: "",
        lastName: "",
        password: "",
        roleIds: [],
      },
    });

    expect(res.createAdministrator.__typename).toStrictEqual("Administrator");
  });
});
