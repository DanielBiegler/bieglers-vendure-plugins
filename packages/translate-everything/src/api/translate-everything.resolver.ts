import { Args, Mutation, Resolver } from "@nestjs/graphql";
import { Allow, Ctx, RelationPaths, Relations, RequestContext, Transaction } from "@vendure/core";
import { PermissionTranslateEverything } from "../constants";
import { TranslateProductInput } from "../generated-admin-types";
import { TranslateEverythingEntryProduct } from "../translate-everything-entry.entity";
import { TranslateEverythingService } from "../translate-everything.service";

@Resolver()
export class TranslateEverythingAdminResolver {
  constructor(private tService: TranslateEverythingService) {}

  // @Query()
  // @Allow(PermissionTranslateEverythingEntry.Read)
  // async translateEverythingEntry(
  //   @Ctx() ctx: RequestContext,
  //   @Args() args: { id: ID }
  // ) {

  // }

  @Mutation()
  @Transaction()
  @Allow(PermissionTranslateEverything.Permission)
  async pluginTranslateProduct(
    @Ctx() ctx: RequestContext,
    @Args() args: { input: TranslateProductInput },
    @Relations(TranslateEverythingEntryProduct) relations?: RelationPaths<TranslateEverythingEntryProduct>,
  ): Promise<TranslateEverythingEntryProduct[]> {
    return this.tService.translateProduct(ctx, args.input, relations);
  }
}
