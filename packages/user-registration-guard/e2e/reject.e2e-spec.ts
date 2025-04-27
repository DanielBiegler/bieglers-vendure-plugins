import { createTestEnvironment } from "@vendure/testing";
import path from "path";
import { afterAll, beforeAll, describe, test } from "vitest";
import { initialData } from "../../../utils/e2e/e2e-initial-data";
import { testConfig } from "../../../utils/e2e/test-config";
import { UserRegistrationGuardPlugin } from "../src/user-registration-guard.plugin";
import { alwaysThrows, alwaysTrue } from "./fixtures/assertions";
import { CREATE_ADMIN } from "./graphql/admin-e2e-definitions";
import { REGISTER_CUSTOMER } from "./graphql/shop-e2e-definitions";
import { CreateMutation, CreateMutationVariables } from "./types/generated-admin-types";
import { RegisterMutation, RegisterMutationVariables } from "./types/generated-shop-types";

/**
 * NOTE:
 * I am aware that this suite tests implementation details but this package shouldn't change much,
 * so I just want to make sure we throw in case I do an oopsy-daisy and remove it sometime in the future.
 */

describe("Rejects", { concurrent: true }, async () => {
  const { server, adminClient, shopClient } = createTestEnvironment({
    ...testConfig(8007),
    plugins: [
      UserRegistrationGuardPlugin.init({
        shop: {
          assert: {
            logicalOperator: "AND",
            functions: [alwaysTrue, alwaysThrows],
          },
        },
        admin: {
          assert: {
            logicalOperator: "AND",
            functions: [alwaysTrue, alwaysThrows, alwaysThrows],
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

  test("Fails when AssertionFunction rejects, for customers", async ({ expect }) => {
    const res = shopClient.query<RegisterMutation, RegisterMutationVariables>(REGISTER_CUSTOMER, {
      input: { emailAddress: "example@example.com" },
    });

    await expect(res).rejects.toThrow(
      "1/2 AssertionFunctions rejected. This should never happen. Handle errors in your assertions.",
    );
  });

  test("Fails when AssertionFunction rejects, for admins", async ({ expect }) => {
    const res = adminClient.query<CreateMutation, CreateMutationVariables>(CREATE_ADMIN, {
      input: {
        emailAddress: "example@example.com",
        firstName: "",
        lastName: "",
        password: "",
        roleIds: [],
      },
    });

    await expect(res).rejects.toThrow(
      "2/3 AssertionFunctions rejected. This should never happen. Handle errors in your assertions.",
    );
  });
});
