import { Injector, RequestContext } from "@vendure/core";
import { MutationCreateAdministratorArgs } from "./generated-admin-types";
import { MutationRegisterCustomerAccountArgs } from "./generated-shop-types";

export type AssertFunctionResult = { isAllowed: boolean; reason?: string };

/**
 * Override the generic in case you extended your Graphql types
 */
export type AssertFunctionShopApi<GraphqlArgs = MutationRegisterCustomerAccountArgs> = (
  ctx: RequestContext,
  args: GraphqlArgs,
  injector: Injector,
) => Promise<AssertFunctionResult>;

/**
 * Override the generic in case you extended your Graphql types
 */
export type AssertFunctionAdminApi<GraphqlArgs = MutationCreateAdministratorArgs> = (
  ctx: RequestContext,
  args: GraphqlArgs,
  injector: Injector,
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
       * - `"AND"` means every single assertion must be true to allow user registration
       * - `"OR"` means user registration is allowed if a single assertion is true
       */
      logicalOperator: "AND" | "OR";
      /**
       * List of async functions which will determine whether or not this user is allowed to register.
       * The assertions run in parallel and the final allow/block decision is made afterwards depending
       * on the configured `shop.assert.logicalOperator`.
       */
      functions: AssertFunctionShopApi<any>[];
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
       * - `"AND"` means every single assertion must be true to allow user registration
       * - `"OR"` means user registration is allowed if a single assertion is true
       */
      logicalOperator: "AND" | "OR";
      /**
       * List of async functions which will determine whether or not this user is allowed to register.
       * The assertions run in parallel and the final allow/block decision is made afterwards depending
       * on the configured `shop.assert.logicalOperator`.
       */
      functions: AssertFunctionAdminApi<any>[];
    };
  };
}
