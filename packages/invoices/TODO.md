# Must

- [x] Eigene Nummernkreise für Gutschriften
  - `SequenceSelectionStrategy` liefert jetzt `{ channelId, code }` pro Dokument;
    `DefaultSequenceSelectionStrategy({ creditNoteCode })` gibt Gutschriften einen eigenen Kreis
- [ ] Research: What about translations? I dont think thats a thing but lets see
- [ ] Default invoice template
  - Research: overridable per Channel
    - Only via code would be safer but multi-vendor setups dont have access to vendure instance. Gotta add it to UI.
- Banner images
  - Use freepik, Pexels/Unsplash dont have what I want

- After stabilization, add custom fields on entities (dont forget custom relations)
- make helper for constructing `INVOICE_DOWNLOAD_ROUTE` routes (normal and export) in constants
- now that we have multiple files we show on invoice detail page we can remove the navbar button
  - replace initial placeholder ui with simple vendure table
- order history channel aware?

## Should


### Could

- [x] Mehrere file strategies gleichzeitig
  - Eine Strategy liefert mehrere Dateien pro Invoice (`{ files: [...] }`), channel-scoped.
  - Mehrere Dokumente mit je eigener Nummer: `DocumentTargetStrategy` +
    `PerSellerOrderTargetStrategy` + `issueDocuments`, d.h. eine Invoice pro Seller-Order.

#### Ideas

- 

