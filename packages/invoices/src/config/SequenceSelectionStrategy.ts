import { ChannelService, ID, InjectableStrategy, Injector, RequestContext } from "@vendure/core";
import { DEFAULT_SEQUENCE_CODE } from "../constants";
import { InvoiceDocumentContext } from "../document-context";

/**
 * Which counter a document draws its number from.
 *
 * @category Strategies
 */
export interface SequenceSelection {
  /** `InvoiceSequence.ownerChannelId` of the counter. */
  channelId: ID;

  /**
   * `InvoiceSequence.code` of the counter.
   *
   * @see {@link DEFAULT_SEQUENCE_CODE}
   */
  code: string;

  /**
   * Create the counter, starting at `initialSequence`, when no row exists yet, rather
   * than failing.
   *
   * The strategy that just named a code is the only thing that knows whether that code
   * is legitimate, which is why the decision lives here and not in the service. Keep it
   * on for codes your strategy can return unconditionally - a vendor's channel is
   * created at runtime and their very first document must not fail because nobody seeded
   * a row. Turn it off for codes an operator is meant to provision deliberately, so that
   * a typo fails loudly instead of quietly minting a second counter that restarts at 1.
   *
   * @default true
   */
  autoCreate?: boolean;

  /** Overrides {@link InvoicesOptions.initialSequence} for an auto-created counter. */
  initialSequence?: number;
}

/**
 * Decides which {@link InvoiceSequence} a document's number comes from.
 *
 * @category Strategies
 */
export interface SequenceSelectionStrategy extends InjectableStrategy {
  /**
   * Read the channel off `doc.channel`, which is authoritative. `ctx` is aimed at the
   * same channel, but on a marketplace the document's channel is the thing that decides
   * whose books this belongs to, so prefer the explicit field.
   */
  select(ctx: RequestContext, doc: InvoiceDocumentContext): Promise<SequenceSelection>;
}

/**
 * @category Strategies
 */
export interface DefaultSequenceSelectionOptions {
  /**
   * `"global"` runs one counter for the whole instance, owned by the default channel.
   *
   * `"channel"` gives every channel its own gapless range, which is what a multi-vendor
   * marketplace needs: each vendor's numbering has to be continuous in *their* books,
   * and a shared counter leaves every vendor's range full of holes where other vendors'
   * documents were.
   *
   * @default "global"
   */
  scope?: "global" | "channel";

  /**
   * When set, credit notes draw from this `InvoiceSequence.code` instead of sharing the
   * invoice counter.
   *
   * This is what jurisdictions demanding a distinct, gapless credit note range require.
   * A differing *prefix* does not achieve it, since both kinds still advance the same
   * underlying counter.
   */
  creditNoteCode?: string;
}

/**
 * Covers both shapes a shop realistically wants: one counter for everything, or one per
 * channel.
 *
 * @category Strategies
 */
export class DefaultSequenceSelectionStrategy implements SequenceSelectionStrategy {
  private channelService: ChannelService;

  constructor(private options: DefaultSequenceSelectionOptions = {}) { }

  init(injector: Injector) {
    this.channelService = injector.get(ChannelService);
  }

  async select(ctx: RequestContext, doc: InvoiceDocumentContext): Promise<SequenceSelection> {
    const channelId = this.options.scope === "channel"
      ? doc.channel.id
      : (await this.channelService.getDefaultChannel(ctx)).id;

    const code = doc.kind === "creditNote" && this.options.creditNoteCode
      ? this.options.creditNoteCode
      : DEFAULT_SEQUENCE_CODE;

    return { channelId, code, autoCreate: true };
  }
}
