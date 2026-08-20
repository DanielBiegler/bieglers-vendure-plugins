# Must

- [x] File generation braucht kontext für file generation z.b. "invoice" | "cancel" ?
  - `InvoiceDocumentContext` wird an alle drei Strategien durchgereicht
- [ ] Eigene Nummernkreise für Gutschriften: `getNextSequentialId` hardcodiert `DEFAULT_SEQUENCE_CODE`, obwohl `InvoiceSequence.code` es könnte
- [ ] Entity: Invoice, CreditNote, Config(?)
  - [ ] Research: Should creditnote be a separate entity or rather a derived state via self-reference cancel
- [ ] Research: What about translations? I dont think thats a thing but lets see
- [ ] Permission: Entity-CRUD, Dedicated Config-Permission
  - Update only for metadata/customfields, invoices must be immutable for compliance
- [ ] Storage
  - Research: Storage per Channel? Needed? Can the storage strategy inject custom logic?
- [ ] Default invoice template
  - Research: Images, Fonts
  - Research: Hardening generation function due to multi vendor exploiting JS?
  - Research: overridable per Channel
    - Only via code would be safer but multi-vendor setups dont have access to vendure instance. Gotta add it to UI.
- Banner images
  - Use freepik, Pexels/Unsplash dont have what I want

## Should

- [ ] Batch zip export for accountants
  - Could be thousands, use job queue. Archive can be large, safer to upload the archive itself instead of temporarily holding in memory?

### Could

-

#### Ideas

- 

