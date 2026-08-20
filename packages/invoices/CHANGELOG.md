# Changelog

## Unreleased

### Added

- `reissueInvoice` mutation: cancels an invoice with a full credit note and issues a replacement for the order's current state, both in one transaction.
- `InvoiceDocumentContext`, a discriminated union (`kind: "invoice" | "creditNote"`) handed to every strategy so file generation can tell the two document types apart.
- `CreateInvoiceInput.reason`, forwarded to the strategies for credit notes. Not persisted on the row - capture it in your snapshot if you need it.

### Changed

- **Breaking:** all three generation strategies now receive `InvoiceDocumentContext` instead of a bare `Order`:
  - `SequentialIdStrategy.generatePrefix(ctx, order)` → `(ctx, doc)`
  - `SnapshotStrategy.generate(ctx, sequentialId, order, cancels?)` → `(ctx, sequentialId, doc)`
  - `FileStrategy.generate(ctx, sequentialId, snapshot)` → `(ctx, sequentialId, snapshot, doc)`

  Reach the order through `doc.order` and the cancelled invoice through `doc.cancels`.
- `DebugSnapshot` gained `kind`, plus `cancels` and `reason` on credit notes.

### Fixed

- A credit note could be booked against an unrelated order, leaving the document crediting order A's invoice while its history entry pointed at order B. `cancels` must now reference an invoice of the same order.

## 0.1.0 (2026-MM-DD)

- First public release. Major version will become 1 and stable after finalizing.

