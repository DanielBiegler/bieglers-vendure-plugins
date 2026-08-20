import { Args, Mutation, Query, Resolver } from "@nestjs/graphql";
import {
  Allow,
  Ctx,
  PaginatedList,
  RelationPaths,
  Relations,
  RequestContext,
  UserInputError,
} from "@vendure/core";
import { InvoicePermissions } from "../constants";
import { InvoiceExport } from "../entities/InvoiceExport.entity";
import {
  DeletionResponse,
  MutationCreateInvoiceExportArgs,
  MutationCreateInvoiceExportDownloadUrlArgs,
  MutationDeleteInvoiceExportArgs,
  QueryInvoiceExportArgs,
  QueryInvoiceExportListArgs,
  QueryInvoiceExportPreviewCountArgs,
} from "../generated-admin-types";
import { InvoiceExportService } from "../services/InvoiceExport.service";

@Resolver()
export class InvoiceExportResolver {
  constructor(private service: InvoiceExportService) { }

  @Query()
  @Allow(InvoicePermissions.Read)
  async invoiceExport(
    @Ctx() ctx: RequestContext,
    @Args() args: QueryInvoiceExportArgs,
    @Relations({ entity: InvoiceExport }) relations: RelationPaths<InvoiceExport>,
  ): Promise<InvoiceExport | null> {
    return this.service.findOne(ctx, args.id, relations);
  }

  @Query()
  @Allow(InvoicePermissions.Read)
  async invoiceExportList(
    @Ctx() ctx: RequestContext,
    @Args() args: QueryInvoiceExportListArgs,
    @Relations({ entity: InvoiceExport }) relations: RelationPaths<InvoiceExport>,
  ): Promise<PaginatedList<InvoiceExport>> {
    return this.service.findAll(ctx, args.options, relations);
  }

  @Query()
  @Allow(InvoicePermissions.Read)
  async invoiceExportPreviewCount(
    @Ctx() ctx: RequestContext,
    @Args() args: QueryInvoiceExportPreviewCountArgs,
  ): Promise<number> {
    const startsAt = new Date(args.startsAt);
    const endsAt = new Date(args.endsAt);

    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()))
      throw new UserInputError("Both `startsAt` and `endsAt` must be valid dates");

    return this.service.countInRange(ctx, startsAt, endsAt);
  }

  /**
   * Guarded by `Read`, not `Create`.
   *
   * An export reads invoices, it does not issue one. Mapping it to `CreateInvoice` would
   * mean anybody allowed to pull a period could also mint legal documents and burn
   * gapless sequence numbers, which is a far larger capability.
   *
   * `Read` is also the honest bound: an export reaches no data that `invoiceList` plus
   * `createInvoiceDownloadUrl` do not already hand out one invoice at a time. A dedicated
   * permission here would look like a boundary while enforcing nothing.
   */
  @Mutation()
  @Allow(InvoicePermissions.Read)
  async createInvoiceExport(
    @Ctx() ctx: RequestContext,
    @Args() args: MutationCreateInvoiceExportArgs,
  ): Promise<InvoiceExport> {
    return this.service.createExport(ctx, args.input);
  }

  @Mutation()
  @Allow(InvoicePermissions.Read)
  async createInvoiceExportDownloadUrl(
    @Ctx() ctx: RequestContext,
    @Args() args: MutationCreateInvoiceExportDownloadUrlArgs,
  ): Promise<string> {
    if (args.neverExpires && args.expiresIn != null)
      throw new UserInputError(`You can specify either "expiresIn" or "neverExpires", not both`);

    // GraphQL Int cannot carry Infinity, so the boolean is what crosses the wire
    return this.service.createDownloadUrl(ctx, args.id, args.neverExpires ? Infinity : args.expiresIn);
  }

  /**
   * The only destructive operation here, so it is kept out of reach of a read-only role.
   *
   * `DeleteInvoice` governs no other route: invoices themselves are immutable for
   * compliance and the plugin never deletes them. Granting it therefore has exactly one
   * effect, which is permitting the removal of export archives.
   */
  @Mutation()
  @Allow(InvoicePermissions.Delete)
  async deleteInvoiceExport(
    @Ctx() ctx: RequestContext,
    @Args() args: MutationDeleteInvoiceExportArgs,
  ): Promise<DeletionResponse> {
    return this.service.deleteExport(ctx, args.id);
  }
}
