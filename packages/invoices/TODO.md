# Must

- [ ] Order History Entry für invoice events
- [ ] File generation braucht kontext für file generation z.b. "invoice" | "cancel" ?
- [ ] Entity: Invoice, CreditNote, Config(?)
  - [ ] Research: Should creditnote be a separate entity or rather a derived state via self-reference cancel
- [ ] Research: What about translations? I dont think thats a thing but lets see
- [ ] Permission: Entity-CRUD, Dedicated Config-Permission
  - Update only for metadata/customfields, invoices must be immutable for compliance
- [ ] Storage
  - Research: Exposing publically
    - Gut reaction: sounds more like an implementation detail, public REST endpoint could use service to read buffer and stream response, this would allow custom setups 
  - Research: Storage per Channel? Needed? Can the storage strategy inject custom logic?
- [ ] Default invoice template
  - Research: Images, Fonts
  - Research: Hardening generation function due to multi vendor exploiting JS?
  - Research: overridable per Channel
    - Only via code would be safer but multi-vendor setups dont have access to vendure instance. Gotta add it to UI.
- [ ] UI
  - Config Page
  - List Page
  - Detail Page
- Banner images
  - Use freepik, Pexels/Unsplash dont have what I want

## Should

- [ ] Batch zip export for accountants
  - Could be thousands, use job queue. Archive can be large, safer to upload the archive itself instead of temporarily holding in memory?

### Could

-

#### Ideas

- 

