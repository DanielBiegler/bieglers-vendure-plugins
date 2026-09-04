import { Args, Mutation, Parent, Query, ResolveField, Resolver } from "@nestjs/graphql";
import { Allow, Ctx, Order, PaginatedList, RelationPaths, Relations, RequestContext, Transaction, UserInputError } from "@vendure/core";
import { InvoicePermissions } from "../constants";
import { Invoice } from "../entities/Invoice.entity";
import { InvoiceFile } from "../entities/InvoiceFile.entity";
import { MutationCreateInvoiceArgs, MutationCreateInvoiceDownloadUrlArgs, MutationIssueInvoiceDocumentsArgs, MutationReissueInvoiceArgs, MutationUpdateInvoiceArgs, OrderInvoicesArgs, QueryInvoiceArgs, QueryInvoiceListArgs } from "../generated-admin-types";
import { InvoiceService, IssuedDocumentSet, ReissueInvoiceResult } from "../services/Invoice.service";

@Resolver()
export class AdminResolver {
  constructor(private service: InvoiceService) { }

  @Query()
  @Allow(InvoicePermissions.Read)
  async invoice(
    @Ctx() ctx: RequestContext,
    @Args() args: QueryInvoiceArgs,
    @Relations({ entity: Invoice, omit: ["files"] }) relations: RelationPaths<Invoice>,
  ): Promise<Invoice | null> {
    return this.service.findOne(ctx, args.input, relations);
  }

  @Query()
  @Allow(InvoicePermissions.Read)
  async invoiceList(
    @Ctx() ctx: RequestContext,
    @Args() args: QueryInvoiceListArgs,
    @Relations({ entity: Invoice, omit: ["files"] }) relations: RelationPaths<Invoice>,
  ): Promise<PaginatedList<Invoice>> {
    return this.service.findAll(ctx, args.options, relations);
  }

  @Mutation()
  @Transaction()
  @Allow(InvoicePermissions.Create)
  async createInvoice(
    @Ctx() ctx: RequestContext,
    @Args() args: MutationCreateInvoiceArgs,
    @Relations({ entity: Invoice, omit: ["files"] }) relations: RelationPaths<Invoice>,
  ): Promise<Invoice> {
    return this.service.issueDocument(ctx, args.input, relations);
  }

  /**
   * The multi-vendor entry point. Like `reissueInvoice` it cannot use `@Relations`, since
   * that decorator reads the selection set of the returned type - a wrapper here rather
   * than an Invoice - and would resolve to no relations at all.
   */
  @Mutation()
  @Transaction()
  @Allow(InvoicePermissions.Create)
  async issueInvoiceDocuments(
    @Ctx() ctx: RequestContext,
    @Args() args: MutationIssueInvoiceDocumentsArgs,
  ): Promise<IssuedDocumentSet> {
    return this.service.issueDocuments(ctx, args.input, ["order"]);
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
    return this.service.createDownloadUrl(
      ctx,
      args.id,
      args.neverExpires ? Infinity : args.expiresIn,
      args.fileId,
    );
  }

  @Mutation()
  @Transaction()
  @Allow(InvoicePermissions.Update)
  async updateInvoice(
    @Ctx() ctx: RequestContext,
    @Args() args: MutationUpdateInvoiceArgs,
    @Relations({ entity: Invoice, omit: ["files"] }) relations: RelationPaths<Invoice>,
  ): Promise<Invoice> {
    return this.service.updateInvoice(ctx, args.input, relations);
  }
}

/**
 * Resolves `Order.invoices`.
 *
 * A field resolver rather than a relation, because `Invoice` is channel-aware and the
 * interesting case - an aggregate marketplace order whose documents live on its seller
 * orders - is not reachable by any relation on Order at all.
 */
@Resolver("Order")
export class OrderEntityResolver {
  constructor(private service: InvoiceService) { }

  @ResolveField()
  async invoices(
    @Ctx() ctx: RequestContext,
    @Parent() order: Order,
    @Args() args: OrderInvoicesArgs,
  ): Promise<Invoice[]> {
    return this.service.findForOrder(ctx, order.id, {
      includeSellerOrders: args.includeSellerOrders ?? false,
    });
  }
}

/**
 * Resolves `Invoice.files` through a channel-scoped query rather than the plain relation.
 *
 * The relation itself is oblivious to channels, so joining it would hand a vendor every
 * artifact of a shared marketplace order, including the ones settling a co-vendor's
 * share. `@Relations({ omit: ["files"] })` on the queries keeps that join from happening
 * in the first place, so this resolver is the only way the field is ever populated.
 */
@Resolver("Invoice")
export class InvoiceEntityResolver {
  constructor(private service: InvoiceService) { }

  @ResolveField()
  async files(@Ctx() ctx: RequestContext, @Parent() invoice: Invoice): Promise<InvoiceFile[]> {
    return this.service.findFiles(ctx, invoice.id);
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
