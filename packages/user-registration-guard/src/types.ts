import { RequestContext } from "@vendure/core";
import { CreateAdministratorInput } from "./generated-admin-types";
import { RegisterCustomerInput } from "./generated-shop-types";

export type AssertFunctionResult = { isAllowed: boolean; reason?: string };

export type AssertFunctionShopApi = (
  ctx: RequestContext,
  input: RegisterCustomerInput,
) => Promise<AssertFunctionResult>;

export type AssertFunctionAdminApi = (
  ctx: RequestContext,
  input: CreateAdministratorInput,
) => Promise<AssertFunctionResult>;

/**
 * These are the configuration options for the plugin.
 *
 * @category Plugin
 */
export interface PluginUserRegistrationGuardOptions {
  /**
   * Configuration options for the shop-api
   */
  shop: {
    /**
     * Configuration for how and whether or not to block user registrations.
     */
    assert: {
      /**
       * How the assertions are logically combined to evaluate the final allow/block decision.
       *
       * - `"AND"` means every single assertion must return `true` to allow user registration
       * - `"OR"` means user registration is allowed if a single assertion returns `true`
       */
      logicalOperator: "AND" | "OR";
      /**
       * List of async functions which will determine whether or not this user is allowed to register.
       * The assertions run in parallel and the final allow/block decision is made afterwards depending
       * on the configured `shop.assert.logicalOperator`.
       */
      functions: AssertFunctionShopApi[];
    };
  };
  /**
   * Configuration options for the admin-api
   */
  admin: {
    /**
     * Configuration for how and whether or not to block user registrations.
     */
    assert: {
      /**
       * How the assertions are logically combined to evaluate the final allow/block decision.
       *
       * - `"AND"` means every single assertion must return `true` to allow user registration
       * - `"OR"` means user registration is allowed if a single assertion returns `true`
       */
      logicalOperator: "AND" | "OR";
      /**
       * List of async functions which will determine whether or not this user is allowed to register.
       * The assertions run in parallel and the final allow/block decision is made afterwards depending
       * on the configured `shop.assert.logicalOperator`.
       */
      functions: AssertFunctionAdminApi[];
    };
  };
}
