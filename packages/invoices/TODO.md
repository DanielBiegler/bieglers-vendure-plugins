# Must

- [ ] Order History Entry für invoice events
- [ ] File generation braucht kontext für file generation z.b. "invoice" | "cancel" ?
- [ ] Entity: Invoice, CreditNote, Config(?)
  - Research: Immutibility for compliance - are snapshots needed, reference to Order might not be good enough
  - Research: Sync config lines with channel creations, is event enough?
  - Config: Add critical alert to changing sequence number, could break entire generation
- [ ] Research: What about translations? I dont think thats a thing but lets see
- [ ] Permission: Entity-CRUD, Dedicated Config-Permission
  - Update only for metadata/customfields, invoices must be immutable for compliance
  - There is no delete for compliance?
- [ ] Storage
  - Research: Exposing publically
    - Gut reaction: sounds more like an implementation detail, public REST endpoint could use service to read buffer and stream response, this would allow custom setups 
  - Research: Storage per Channel? Needed?
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

- [ ] Plugin Options: Allow disabling of custom templates, hides UI, prevents API mutation
- [ ] Plugin Options: Nummernkreise per channel vs. global single

#### Ideas

- 

