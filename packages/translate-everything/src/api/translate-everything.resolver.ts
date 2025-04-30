import { Args, Mutation, Resolver } from "@nestjs/graphql";
import { Allow, Ctx, Product, RelationPaths, Relations, RequestContext, Transaction, Translated } from "@vendure/core";
import { PermissionTranslateEverything } from "../constants";
import { TranslateProductInput } from "../generated-admin-types";
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
  async translateProduct(
    @Ctx() ctx: RequestContext,
    @Args() args: { input: TranslateProductInput },
    @Relations(Product) relations?: RelationPaths<Product>,
  ): Promise<Translated<Product>> {
    return this.tService.translateProduct(ctx, args.input, relations);
  }
}
