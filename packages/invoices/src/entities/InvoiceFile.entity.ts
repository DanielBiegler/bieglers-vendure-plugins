import { Channel, ChannelAware, DeepPartial, EntityId, ID, VendureEntity } from "@vendure/core";
import { Column, Entity, Index, JoinTable, ManyToMany, ManyToOne } from "typeorm";
import { Invoice } from "./Invoice.entity";

/**
 * One artifact of an invoice, e.g. the PDF or the Factur-X XML beside it.
 *
 * A row rather than a JSON column on {@link Invoice} so that `assetUrl` keeps its unique
 * index - the net that stops two invoices from ever claiming the same storage object -
 * and so that a file has an ID of its own for signed download URLs to address.
 *
 * Immutable like the invoice it belongs to: a document that has been handed to an
 * accountant is corrected by issuing a credit note, never by rewriting its bytes.
 *
 * Channel-aware independently of its invoice, which is what lets one marketplace order
 * carry the paperwork of several vendors: the invoice spans every channel involved,
 * while each artifact is readable only by the party it settles.
 */
@Entity()
export class InvoiceFile extends VendureEntity implements ChannelAware {
  constructor(input?: DeepPartial<InvoiceFile>) {
    super(input);
  }

  @Index()
  @EntityId({ nullable: false })
  invoiceId: ID;

  @ManyToOne(() => Invoice, (invoice) => invoice.files, { nullable: false, onDelete: "CASCADE" })
  invoice: Invoice;

  /**
   * Opaque {@link AssetStorageStrategy} identifier. May be a filesystem path or a bucket
   * key and is not necessarily reachable by a browser, so never treat it as a link.
   */
  @Column({ nullable: false, unique: true })
  assetUrl: string;

  /** Name the file is served under, extension included. Unique within one invoice. */
  @Column({ nullable: false })
  filename: string;

  /**
   * `Content-Type` the download endpoint serves, as declared by the FileStrategy.
   *
   * Null when the strategy did not claim one, in which case downloads fall back to
   * `application/octet-stream`.
   */
  @Column({ type: String, nullable: true })
  mimeType: string | null;

  /**
   * Size of the stored file, counted from the generated buffer.
   *
   * Recorded at write time because {@link AssetStorageStrategy} offers no way to ask a
   * stored object for its size afterwards, and without it a download cannot send a
   * `Content-Length` for the browser to show progress against.
   */
  @Column({ nullable: false })
  fileSizeBytes: number;

  /**
   * Order the FileStrategy returned the files in. Position `0` is the primary document,
   * i.e. what a download without an explicit file selector serves.
   */
  @Column({ nullable: false })
  position: number;

  /**
   * Who may see and download this file.
   */
  @ManyToMany(() => Channel)
  @JoinTable()
  channels: Channel[];
}
