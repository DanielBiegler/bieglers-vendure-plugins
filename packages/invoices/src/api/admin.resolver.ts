import { Args, Mutation, Query, Resolver } from "@nestjs/graphql";
import { Allow, Ctx, PaginatedList, RelationPaths, Relations, RequestContext, Transaction, UserInputError } from "@vendure/core";
import { InvoicePermissions } from "../constants";
import { Invoice } from "../entities/Invoice.entity";
import { MutationCreateInvoiceArgs, MutationCreateInvoiceDownloadUrlArgs, MutationReissueInvoiceArgs, MutationUpdateInvoiceArgs, QueryInvoiceArgs, QueryInvoiceListArgs } from "../generated-admin-types";
import { InvoiceService, ReissueInvoiceResult } from "../services/Invoice.service";

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

  @Mutation()
  @Transaction()
  @Allow(InvoicePermissions.Create)
  async createInvoice(
    @Ctx() ctx: RequestContext,
    @Args() args: MutationCreateInvoiceArgs,
    @Relations({ entity: Invoice }) relations: RelationPaths<Invoice>,
  ): Promise<Invoice> {
    return this.service.createInvoice(ctx, args.input, relations);
  }

  /**
   * Create rather than Update: nothing about the cancelled invoice is mutated, the
   * mutation only ever appends two new documents to the ledger.
   */
  @Mutation()
  @Transaction()
  @Allow(InvoicePermissions.Create)
  async reissueInvoice(
    @Ctx() ctx: RequestContext,
    @Args() args: MutationReissueInvoiceArgs,
  ): Promise<ReissueInvoiceResult> {
    // Not @Relations: that decorator reads the selection set of the type being returned,
    // which here is the wrapper rather than an Invoice, so it would resolve to no
    // relations at all and leave the non-nullable "order" field unresolvable.
    return this.service.reissueInvoice(ctx, args.input, ["order"]);
  }

  @Mutation()
  @Allow(InvoicePermissions.Read)
  async createInvoiceDownloadUrl(
    @Ctx() ctx: RequestContext,
    @Args() args: MutationCreateInvoiceDownloadUrlArgs,
  ): Promise<string> {
    if (args.neverExpires && args.expiresIn != null)
      throw new UserInputError(`You can specify either "expiresIn" or "neverExpires", not both`);

    // GraphQL Int cannot carry Infinity, so the boolean is what crosses the wire
    return this.service.createDownloadUrl(ctx, args.id, args.neverExpires ? Infinity : args.expiresIn);
  }

  @Mutation()
  @Transaction()
  @Allow(InvoicePermissions.Update)
  async updateInvoice(
    @Ctx() ctx: RequestContext,
    @Args() args: MutationUpdateInvoiceArgs,
    @Relations({ entity: Invoice }) relations: RelationPaths<Invoice>,
  ): Promise<Invoice> {
    return this.service.updateInvoice(ctx, args.input, relations);
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
