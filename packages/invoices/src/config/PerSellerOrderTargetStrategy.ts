import { OrderType } from "@vendure/common/lib/generated-types";
import {
  Channel,
  ChannelService,
  ID,
  idsAreEqual,
  Injector,
  Order,
  OrderLine,
  OrderService,
  RequestContext,
  TransactionalConnection,
} from "@vendure/core";
import { DocumentTargetStrategy, InvoiceDocumentTarget } from "./DocumentTargetStrategy";

/**
 * @category Strategies
 */
export interface PerSellerOrderTargetStrategyOptions {
  /**
   * Also issue a document for the aggregate order itself, in the channel the aggregate
   * belongs to.
   *
   * Off by default, and dangerous to switch on without thinking: Vendure's
   * `OrderSplitter` *duplicates* the order lines onto the seller orders rather than
   * moving them, so the aggregate and the seller orders together sum to twice the sale.
   * Only enable this when the aggregate document is a customer-facing summary that your
   * bookkeeping does not post.
   */
  includeAggregate?: boolean;

  /**
   * Overrides how a seller order is attributed to a channel. See
   * {@link PerSellerOrderTargetStrategy} for what the built-in resolution does.
   */
  resolveChannelId?: (ctx: RequestContext, sellerOrder: Order) => Promise<ID>;
}

/**
 * Expands a split marketplace order into one document per vendor, each in that vendor's
 * channel and therefore drawing from that vendor's sequence.
 *
 * Pair it with `new DefaultSequenceSelectionStrategy({ scope: "channel" })`, or every
 * vendor's range will be full of holes where the other vendors' documents were.
 *
 * A plain (unsplit) order resolves to exactly one document, so a shop that only sometimes
 * sells across vendors can configure this unconditionally.
 *
 * @category Strategies
 */
export class PerSellerOrderTargetStrategy implements DocumentTargetStrategy {
  private channelService: ChannelService;
  private connection: TransactionalConnection;
  private orderService: OrderService;

  constructor(private options: PerSellerOrderTargetStrategyOptions = {}) { }

  init(injector: Injector) {
    this.channelService = injector.get(ChannelService);
    this.connection = injector.get(TransactionalConnection);
    this.orderService = injector.get(OrderService);
  }

  async resolveTargets(ctx: RequestContext, order: Order): Promise<InvoiceDocumentTarget[]> {
    // A seller order bills exactly itself, which is what lets you re-issue for one vendor
    // without touching the others. This `type` is trustworthy: the splitter saves seller
    // orders with it set.
    if (order.type === OrderType.Seller)
      return [{ order, channel: await this.channelOf(ctx, order) }];

    // Whether the order was split is decided by looking for seller orders, NOT by reading
    // `order.type`. The splitter sets `type = Aggregate` in memory and Vendure only saves
    // it once the state transition finishes, so a caller hooking into
    // `afterSellerOrdersCreated` - the natural place to issue documents - re-loads the
    // order and still sees "Regular". `aggregateOrderId` on the seller orders is written
    // before that hook runs, so keying off it is correct at every point in the lifecycle.
    //
    // Unfiltered by channel in Vendure, so this resolves the whole set even from the
    // storefront channel the aggregate lives in.
    const sellerOrders = await this.orderService.getSellerOrders(ctx, order);

    if (!sellerOrders.length)
      return [{ order, channel: ctx.channel }];

    const targets: InvoiceDocumentTarget[] = [];
    for (const sellerOrder of sellerOrders)
      targets.push({ order: sellerOrder, channel: await this.channelOf(ctx, sellerOrder) });

    if (this.options.includeAggregate)
      targets.push({ order, channel: ctx.channel });

    return targets;
  }

  /**
   * Attributes a seller order to the channel whose books it belongs in.
   *
   * `OrderLine.sellerChannelId` comes first because it is the only *positive* record
   * Vendure keeps of who sells what; the channel list is a fallback, and a lossy one,
   * since the splitter writes only the default channel when the vendor is the default
   * channel.
   */
  private async channelOf(ctx: RequestContext, sellerOrder: Order): Promise<Channel> {
    if (this.options.resolveChannelId)
      return this.channelById(ctx, await this.options.resolveChannelId(ctx, sellerOrder));

    // `getSellerOrders` does not load lines, so they are fetched rather than assumed.
    // A query builder because OrderLine exposes only the `order` relation, not an
    // `orderId` field, and joining the whole order to read one foreign key is wasteful.
    const lines: Array<Pick<OrderLine, "sellerChannelId">> = await this.connection
      .getRepository(ctx, OrderLine)
      .createQueryBuilder("line")
      .select(["line.id", "line.sellerChannelId"])
      .where("line.orderId = :orderId", { orderId: sellerOrder.id })
      .getMany();

    const sellerChannelIds = lines
      .map(line => line.sellerChannelId)
      .filter((id): id is ID => id != null);

    const distinct = sellerChannelIds.filter(
      (id, index) => sellerChannelIds.findIndex(other => idsAreEqual(other, id)) === index,
    );

    // A custom `splitOrder` produced one sub-order covering two vendors. Guessing which
    // one gets billed would silently misattribute revenue, so refuse instead.
    if (distinct.length > 1)
      throw new Error(
        `Seller order "${sellerOrder.code}" has lines from ${distinct.length} different seller ` +
        `channels, so there is no single channel to issue its document in. Split it further, ` +
        `or supply "resolveChannelId".`,
      );

    if (distinct.length === 1) return this.channelById(ctx, distinct[0]);

    const defaultChannel = await this.channelService.getDefaultChannel(ctx);
    const nonDefault = (sellerOrder.channels ?? []).find(
      channel => !idsAreEqual(channel.id, defaultChannel.id),
    );

    // No non-default channel left means the vendor *is* the default channel, which is a
    // shape the splitter creates deliberately rather than an error.
    return nonDefault ?? defaultChannel;
  }

  private async channelById(ctx: RequestContext, id: ID): Promise<Channel> {
    const channel = await this.channelService.findOne(ctx, id);
    if (!channel) throw new Error(`No channel with the ID "${id}"`);
    return channel;
  }
}
