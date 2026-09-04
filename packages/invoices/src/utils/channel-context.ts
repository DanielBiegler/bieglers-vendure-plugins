import { Channel, idsAreEqual, RequestContext } from "@vendure/core";

/**
 * Description of the symbol TypeORM's transaction manager is stashed under on a
 * {@link RequestContext}.
 *
 * Matched by description rather than imported, because the symbol lives in
 * `@vendure/core/dist/common/constants` and is deliberately not re-exported from the
 * package root. Reaching it by description survives Vendure moving the file, which a
 * deep import would not.
 */
const TRANSACTION_MANAGER_DESCRIPTION = "TRANSACTION_MANAGER";

function transactionManagerOf(ctx: RequestContext): unknown {
  const key = Object.getOwnPropertySymbols(ctx).find(
    (symbol) => symbol.description === TRANSACTION_MANAGER_DESCRIPTION,
  );
  return key ? (ctx as unknown as Record<symbol, unknown>)[key] : undefined;
}

/**
 * Throws unless `ctx` carries an open transaction.
 *
 * Issuing documents is all-or-nothing: every number of a set is claimed inside one
 * transaction so that a failure takes the numbers back with it and every sequence stays
 * gapless. Opening a transaction here instead of throwing would hide from the caller
 * that *their* surrounding writes are not covered by it.
 *
 * Worth asserting rather than assuming, because the failure is invisible on SQLite: the
 * row lock that would otherwise complain is skipped there, so an untransacted call
 * silently commits and only shows up later as a gap in the books.
 */
export function assertInTransaction(ctx: RequestContext, operation: string): void {
  if (transactionManagerOf(ctx) === undefined)
    throw new Error(
      `"${operation}" must run inside a transaction. Wrap the call in ` +
      `connection.withTransaction(ctx, ...) or annotate the resolver with @Transaction(). ` +
      `Without one the invoice sequence cannot be kept gapless.`,
    );
}

/**
 * `ctx` acting in `channel`, so that every channel-scoped read and write made through it
 * lands where the document belongs.
 *
 * Built by copying rather than through `RequestContextService.create()`, and the reason
 * is the transaction. {@link TransactionalConnection} decides which connection a
 * repository talks to by reading the transaction manager off a symbol on the context,
 * and `copy()` carries it because `Object.assign` copies symbol keys - which is exactly
 * how Vendure's own `withTransaction` propagates it. A freshly *created* context has no
 * such symbol, so every write through it would run on a different connection outside the
 * transaction: on Postgres the `SELECT ... FOR UPDATE` in the sequence lookup throws,
 * and on SQLite, where there is no lock at all, it would commit independently and
 * silently destroy the all-or-nothing guarantee the document-set API exists to provide.
 *
 * Copying also keeps the caller's real session, permissions and `req`, where `create()`
 * would synthesise a dummy session and force `isAuthorized: true`.
 *
 * `languageCode` is deliberately left as the caller's: the language a document is
 * written in follows the request, not the vendor. `currencyCode` is left alone too -
 * amounts belong to the order and its snapshot, never to the context.
 */
export function forChannel(ctx: RequestContext, channel: Channel): RequestContext {
  const channelCtx = ctx.copy();

  // `_channel` is private with only a getter exposed, and `channelId` derives from it.
  // The public surface offers no way to re-aim a context; the alternative - fabricating
  // one and patching an unexported symbol back onto it - reaches further into Vendure's
  // internals than this single assignment does.
  (channelCtx as unknown as { _channel: Channel })._channel = channel;

  if (!idsAreEqual(channelCtx.channelId, channel.id))
    throw new Error(
      `Could not re-aim the RequestContext at channel "${channel.code}". ` +
      `RequestContext no longer resolves its channel from "_channel".`,
    );

  return channelCtx;
}
