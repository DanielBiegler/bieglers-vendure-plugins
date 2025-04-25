import { RequestContext, VendureEvent } from "@vendure/core";
import { RegisterCustomerInput } from "../generated-shop-types";

/**
 * This event is fired whenever registration was blocked
 */
export class UserRegistrationBlockedEvent extends VendureEvent {
  constructor(
    public ctx: RequestContext,
    public input: RegisterCustomerInput, // TODO what about admin?
    // TODO would be nice to tell what went wrong i.e. which assertion(s?) failed
  ) {
    super();
  }
}
