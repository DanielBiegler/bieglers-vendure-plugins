import { Args, Mutation, Resolver } from "@nestjs/graphql";
import { Allow, Ctx, Permission, RequestContext, Transaction } from "@vendure/core";
import { DBOSJobQueueService } from "../services/main.service";

@Resolver()
export class AdminResolver {
  constructor(private service: DBOSJobQueueService) { }

  @Mutation()
  @Transaction()
  @Allow(Permission.SuperAdmin)
  async pluginDBOSJobQueueExample(
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
