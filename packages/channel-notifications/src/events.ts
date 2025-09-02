import { RequestContext, VendureEntityEvent, VendureEvent } from '@vendure/core';
import { ChannelNotification } from './entities/channel-notification.entity';
import { ChannelNotificationCreateInput, ChannelNotificationDeleteInput, ChannelNotificationMarkAsReadInput, ChannelNotificationUpdateInput, } from './generated-admin-types';


export type ChannelNotificationEventInput =
  | ChannelNotificationCreateInput
  | ChannelNotificationUpdateInput
  | ChannelNotificationDeleteInput;


/**
 * This event is fired whenever a ChannelNotification is added, updated or deleted.
 */
export class ChannelNotificationEvent extends VendureEntityEvent<ChannelNotification, ChannelNotificationEventInput> {
  constructor(
    ctx: RequestContext,
    entity: ChannelNotification,
    type: 'created' | 'updated' | 'deleted',
    input?: ChannelNotificationEventInput,
  ) {
    super(entity, type, ctx, input);
  }
}

/**
 * This event is fired whenever a ChannelNotification was marked as read
 */
export class ChannelNotificationEventMarkedAsRead extends VendureEvent {
  constructor(
    public ctx: RequestContext,
    public input: ChannelNotificationMarkAsReadInput,
  ) {
    super();
  }
}
