import { Asset, DeepPartial, VendureEntity } from '@vendure/core';
import { Column, Entity, ManyToOne } from 'typeorm';

@Entity()
export class UserNotification extends VendureEntity {
  constructor(input?: DeepPartial<UserNotification>) {
    super(input);
  }

  @ManyToOne(() => Asset, { nullable: true })
  asset: Asset | null; // TODO check if stuff is undefined or null when constructing

  @Column({ nullable: true })
  dateTime: Date | null;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  content: string | null;

  @Column({ nullable: true })
  readAt: Date | null;
}


