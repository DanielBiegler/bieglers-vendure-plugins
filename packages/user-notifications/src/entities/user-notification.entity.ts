import { Asset, Channel, ChannelAware, DeepPartial, EntityId, HasCustomFields, ID, LanguageCode, LocaleString, Translatable, Translation, User, VendureEntity } from '@vendure/core';
import { Column, Entity, JoinTable, ManyToMany, ManyToOne, OneToMany, Unique } from 'typeorm';

export class CustomUserNotificationFields { }
export class CustomUserNotificationReadEntryFields { }
export class CustomUserNotificationFieldsTranslation { }

@Entity()
export class UserNotification extends VendureEntity implements HasCustomFields, ChannelAware, Translatable {
  constructor(input?: DeepPartial<UserNotification>) {
    super(input);
  }

  @ManyToMany(() => Channel)
  @JoinTable()
  channels: Channel[];

  @OneToMany(() => UserNotificationTranslation, t => t.base, { eager: true })
  translations: Array<Translation<UserNotification>>;

  @Column(() => CustomUserNotificationFields)
  customFields: CustomUserNotificationFields;

  @Column({ type: "datetime", nullable: true })
  dateTime: Date | null;

  @OneToMany(() => UserNotificationReadEntry, e => e.notification)
  readEntries: UserNotificationReadEntry[];

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
export class UserNotificationReadEntry extends VendureEntity implements HasCustomFields, ChannelAware {
  constructor(input?: DeepPartial<UserNotificationReadEntry>) {
    super(input);
  }

  @ManyToMany(() => Channel)
  @JoinTable()
  channels: Channel[];

  @Column(() => CustomUserNotificationReadEntryFields)
  customFields: CustomUserNotificationReadEntryFields;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  user: User;

  @EntityId()
  userId: ID;

  @ManyToOne(() => UserNotification, { onDelete: "CASCADE" })
  notification: UserNotification

  @EntityId()
  notificationId: ID;

  @Column("datetime")
  dateTime: Date;
}

@Entity()
export class UserNotificationTranslation extends VendureEntity implements Translation<UserNotification>, HasCustomFields {
  constructor(input?: DeepPartial<Translation<UserNotificationTranslation>>) {
    super(input);
  }

  @Column("varchar")
  languageCode: LanguageCode;

  @ManyToOne(() => UserNotification, (base) => base.translations, { onDelete: 'CASCADE' })
  base: UserNotification;

  @Column(() => CustomUserNotificationFieldsTranslation)
  customFields: CustomUserNotificationFieldsTranslation;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  content: string | null;
}
