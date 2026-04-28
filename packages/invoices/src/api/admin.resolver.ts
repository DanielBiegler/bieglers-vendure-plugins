import { Args, Query, Resolver } from "@nestjs/graphql";
import { Allow, Ctx, PaginatedList, RelationPaths, Relations, RequestContext } from "@vendure/core";
import { InvoicePermissions } from "../constants";
import { Invoice } from "../entities/Invoice.entity";
import { QueryInvoiceArgs, QueryInvoiceListArgs } from "../generated-admin-types";
import { InvoiceService } from "../services/Invoice.service";

@Resolver()
export class AdminResolver {
  constructor(private service: InvoiceService) { }

  @Query()
  @Allow(InvoicePermissions.Read)
  async invoice(
    @Ctx() ctx: RequestContext,
    @Args() args: QueryInvoiceArgs,
    @Relations({ entity: Invoice }) relations: RelationPaths<Invoice>,
  ): Promise<Invoice | null> {
    return this.service.findOne(ctx, args.input, relations);
  }

  @Query()
  @Allow(InvoicePermissions.Read)
  async invoiceList(
    @Ctx() ctx: RequestContext,
    @Args() args: QueryInvoiceListArgs,
    @Relations({ entity: Invoice }) relations: RelationPaths<Invoice>,
  ): Promise<PaginatedList<Invoice>> {
    return this.service.findAll(ctx, args.options, relations);
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
