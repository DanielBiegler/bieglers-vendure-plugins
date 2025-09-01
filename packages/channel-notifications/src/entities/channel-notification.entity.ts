import { Asset, Channel, ChannelAware, DeepPartial, EntityId, HasCustomFields, ID, LanguageCode, LocaleString, Translatable, Translation, User, VendureEntity } from '@vendure/core';
import { Column, Entity, JoinTable, ManyToMany, ManyToOne, OneToMany, Unique } from 'typeorm';

export class CustomChannelNotificationFields { }
export class CustomChannelNotificationReadEntryFields { }
export class CustomChannelNotificationFieldsTranslation { }

@Entity()
export class ChannelNotification extends VendureEntity implements HasCustomFields, ChannelAware, Translatable {
  constructor(input?: DeepPartial<ChannelNotification>) {
    super(input);
  }

  @ManyToMany(() => Channel)
  @JoinTable()
  channels: Channel[];

  @OneToMany(() => ChannelNotificationTranslation, t => t.base, { eager: true })
  translations: Array<Translation<ChannelNotification>>;

  @Column(() => CustomChannelNotificationFields)
  customFields: CustomChannelNotificationFields;

  @Column({ type: "datetime", nullable: true })
  dateTime: Date | null;

  @OneToMany(() => ChannelNotificationReadEntry, e => e.notification)
  readEntries: ChannelNotificationReadEntry[];

  // `readAt` gets resolved via field-resolver

  @ManyToOne(() => Asset, { nullable: true })
  asset: Asset | null;

  @EntityId({ nullable: true })
  assetId: ID | null;

  title: LocaleString;
  content: LocaleString | null;
}

@Entity()
@Unique(["user", "notification"])
export class ChannelNotificationReadEntry extends VendureEntity implements HasCustomFields, ChannelAware {
  constructor(input?: DeepPartial<ChannelNotificationReadEntry>) {
    super(input);
  }

  @ManyToMany(() => Channel)
  @JoinTable()
  channels: Channel[];

  @Column(() => CustomChannelNotificationReadEntryFields)
  customFields: CustomChannelNotificationReadEntryFields;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  user: User;

  @EntityId()
  userId: ID;

  @ManyToOne(() => ChannelNotification, { onDelete: "CASCADE" })
  notification: ChannelNotification

  @EntityId()
  notificationId: ID;

  @Column("datetime")
  dateTime: Date;
}

@Entity()
export class ChannelNotificationTranslation extends VendureEntity implements Translation<ChannelNotification>, HasCustomFields {
  constructor(input?: DeepPartial<Translation<ChannelNotificationTranslation>>) {
    super(input);
  }

  @Column("varchar")
  languageCode: LanguageCode;

  @ManyToOne(() => ChannelNotification, (base) => base.translations, { onDelete: 'CASCADE' })
  base: ChannelNotification;

  @Column(() => CustomChannelNotificationFieldsTranslation)
  customFields: CustomChannelNotificationFieldsTranslation;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  content: string | null;
}
