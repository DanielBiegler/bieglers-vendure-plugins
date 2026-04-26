import { Args, Mutation, Resolver } from "@nestjs/graphql";
import { Allow, Ctx, RequestContext, Transaction } from "@vendure/core";
import { permissionsCrud } from "../constants";
import { InvoiceService } from "../services/Invoice.service";

@Resolver()
export class AdminResolver {
  constructor(private service: InvoiceService) { }

  @Mutation()
  @Transaction()
  @Allow(permissionsCrud.Read)
  async invoice(
    @Ctx() ctx: RequestContext,
    @Args() args: any, // TODO replace with your new types
  ): Promise<any> { // TODO replace with your new types
    return null;
  }
}

// In case you need a field resolver for result unions
// 
// @Resolver("ExamplePluginCreateResult")
// export class ExamplePluginCreateResultResolver {
//   @ResolveField()
//   __resolveType(value: any): string {
//     // If it has an "id" property we can assume it is an `Asset`
//     return value.hasOwnProperty("id") ? "Asset" : "PluginExampleCreateResult";
//   }
// }
