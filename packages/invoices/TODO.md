# Must

- [ ] Plugin Options
  - Research: Customizable Vendor Prefixes
    - Could be instance owner strategy
    - Real world example: `$PREFIX_$YEAR_$SEQUENCE`
      - Add injector for lookups? But keep in mind if prefix is user controlled it could break compliance upon change. Strategy with injector would allow instance owner to make a user controlled prefix while the default strategy is only controllable by instance owner
    - Making customizable by vendor potentially breaks compliance?
- [ ] Entity: Invoice, CreditNote, Config(?)
  - Must be Channel-Aware, HasCustomFields
  - Research: Immutibility for compliance - are snapshots needed, reference to Order might not be good enough
  - Research: Gapless sequence via row level transaction locks. In config entity?
  - Config: Add critical alert to changing sequence number, could break entire generation
  - Config: Make template nullable to inherit a base default template that can be updated by instance owner
  - Config: Own Nummernkreis per invoice/credit-note
- [ ] Events: CRUD
- [ ] Permission: Entity-CRUD, Dedicated Config-Permission
  - Update only for metadata/customfields, invoices must be immutable for compliance
  - There is no delete for compliance?
- [ ] Service: Invoice
  - Use job queue, maybe also provide sync method - needed?
- [ ] Storage
  - Research: Reusability of AssetStorageStrategy and factories (see local/s3)
    - Asset names strategy
  - Research: Exposing publically
    - Gut reaction: sounds more like an implementation detail, public REST endpoint could use service to read buffer and stream response, this would allow custom setups 
  - Research: Storage per Channel? Needed?
- [ ] Default invoice template
  - Research: Hardening generation function due to multi vendor exploiting JS?
  - Research: Images
  - Research: overridable per Channel
    - Only via code would be safer but multi-vendor setups dont have access to vendure instance. Gotta add it to UI.
- [ ] UI
  - Config Page
  - List Page
  - Detail Page
- [ ] Job queue
  - Vendors may override generation function i.e. we dont know how long a generation takes
  - Long zip exports

## Should

- [ ] Batch zip export for accountants
  - Could be thousands, use job queue. Archive can be large, safer to upload the archive itself instead of temporarily holding in memory?

### Could

- [ ] Plugin Options: Allow disabling of custom templates, hides UI, prevents API mutation
- [ ] Plugin Options: Nummernkreise per channel vs. global single

#### Ideas

- 

