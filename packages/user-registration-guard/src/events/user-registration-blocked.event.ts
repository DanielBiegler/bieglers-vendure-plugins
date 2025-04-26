import { RequestContext, VendureEvent } from "@vendure/core";
import { CreateAdministratorInput } from "../generated-admin-types";
import { RegisterCustomerInput } from "../generated-shop-types";
import { AssertFunctionResult } from "../types";

/**
 * This event is fired whenever registration was blocked
 */
export class UserRegistrationBlockedEvent extends VendureEvent {
  constructor(
    public ctx: RequestContext,
    public input: RegisterCustomerInput | CreateAdministratorInput,
    public assertions: AssertFunctionResult[],
  ) {
    super();
  }
}
