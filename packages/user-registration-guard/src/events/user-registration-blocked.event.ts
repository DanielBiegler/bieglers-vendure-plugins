import { RequestContext, VendureEvent } from "@vendure/core";
import { MutationCreateAdministratorArgs } from "../generated-admin-types";
import { MutationRegisterCustomerAccountArgs } from "../generated-shop-types";
import { AssertFunctionResult } from "../types";

/**
 * This event is fired whenever a customer registration was blocked.
 *
 * Override the generic in case you extended your Graphql types.
 */
export class BlockedCustomerRegistrationEvent<GraphqlArgs = MutationRegisterCustomerAccountArgs> extends VendureEvent {
  constructor(
    public ctx: RequestContext,
    public args: GraphqlArgs,
    public assertions: AssertFunctionResult[],
  ) {
    super();
  }
}

/**
 * This event is fired whenever the creation of a new admin was blocked.
 *
 * Override the generic in case you extended your Graphql types.
 */
export class BlockedCreateAdministratorEvent<GraphqlArgs = MutationCreateAdministratorArgs> extends VendureEvent {
  constructor(
    public ctx: RequestContext,
    public args: GraphqlArgs,
    public assertions: AssertFunctionResult[],
  ) {
    super();
  }
}
