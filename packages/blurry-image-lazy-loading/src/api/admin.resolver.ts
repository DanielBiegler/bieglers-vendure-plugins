import { Args, Mutation, ResolveField, Resolver } from "@nestjs/graphql";
import { Allow, Asset, Ctx, RelationPaths, Relations, RequestContext, Transaction } from "@vendure/core";
import {
  MutationPluginPreviewImageHashCreateImageHashArgs,
  MutationPluginPreviewImageHashCreateImageHashesForAllAssetsArgs,
  MutationPluginPreviewImageHashCreateImageHashesForCollectionArgs,
  MutationPluginPreviewImageHashCreateImageHashesForProductArgs,
  Permission,
  PluginPreviewImageHashCreateResult,
  PluginPreviewImageHashResult,
} from "../generated-admin-types";
import { PreviewImageHashService } from "../services/PreviewImageHashService";

@Resolver()
export class AdminResolver {
  constructor(private previewImageHashService: PreviewImageHashService) { }

  @Mutation()
  @Transaction()
  @Allow(Permission.CreateAsset)
  async pluginPreviewImageHashCreateImageHash(
    @Ctx() ctx: RequestContext,
    @Args() args: MutationPluginPreviewImageHashCreateImageHashArgs,
    @Relations(Asset) relations?: RelationPaths<Asset>,
  ): Promise<PluginPreviewImageHashCreateResult> {
    return this.previewImageHashService.create(ctx, args.input, relations);
  }

  @Mutation()
  @Transaction()
  @Allow(Permission.CreateAsset)
  async pluginPreviewImageHashCreateImageHashesForCollection(
    @Ctx() ctx: RequestContext,
    @Args() args: MutationPluginPreviewImageHashCreateImageHashesForCollectionArgs,
  ): Promise<PluginPreviewImageHashResult> {
    return this.previewImageHashService.createForCollection(ctx, args.input);
  }

  @Mutation()
  @Transaction()
  @Allow(Permission.CreateAsset)
  async pluginPreviewImageHashCreateImageHashesForProduct(
    @Ctx() ctx: RequestContext,
    @Args() args: MutationPluginPreviewImageHashCreateImageHashesForProductArgs,
  ): Promise<PluginPreviewImageHashResult> {
    return this.previewImageHashService.createForProduct(ctx, args.input);
  }

  @Mutation()
  @Transaction()
  @Allow(Permission.CreateAsset)
  async pluginPreviewImageHashCreateImageHashesForAllAssets(
    @Ctx() ctx: RequestContext,
    @Args() args: MutationPluginPreviewImageHashCreateImageHashesForAllAssetsArgs,
  ): Promise<PluginPreviewImageHashResult> {
    return this.previewImageHashService.createForAllAssets(ctx, args.input);
  }
}

@Resolver("PluginPreviewImageHashCreateResult")
export class PluginPreviewImageHashCreateResultResolver {
  @ResolveField()
  __resolveType(value: any): string {
    // If it has an "id" property we can assume it is an `Asset`
    return value.hasOwnProperty("id") ? "Asset" : "PluginPreviewImageHashResult";
  }
}
