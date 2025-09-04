![Banner Image](https://raw.githubusercontent.com/DanielBiegler/bieglers-vendure-plugins/master/packages/channel-notifications/assets/thumbnail_16x9.jpeg)

# Vendure Plugin: Channel Notifications

Foundation for building notification inboxes and or changelogs for your users. Features channel aware, translatable and customizable notifications with read-receipts per user.

<a href="https://www.npmjs.com/package/@danielbiegler/vendure-plugin-channel-notifications" target="_blank">
  <img src="https://badge.fury.io/js/@danielbiegler%2Fvendure-plugin-channel-notifications.svg" alt="npm version badge" height="18">
</a>

## Features

- Notification entity with read-receipts
- Title and content are [translatable](#TODO)
- Notification-/, Translation-/ and Read-Receipt-Entities are extendable by you via [Custom Fields](#TODO) to fit your specific business needs
- Each Channel can have their own separate notifications as they implement [`ChannelAware`](#TODO)
- Publishes events on the [EventBus](#TODO)
- Granular CRUD permissions
- Suite of end-to-end tests ensuring correctness

### End-To-End Tests

```
 ✓ channel-notifications/e2e/plugin.e2e-spec.ts (10 tests)
   ✓ Plugin > Create notification
   ✓ Plugin > Delete notification
   ✓ Plugin > Update notification
   ✓ Plugin > Read notification
   ✓ Plugin > Read paginated notifications, default order DESC 
   ✓ Plugin > Mark notification as read
   ✓ Plugin > Mark notification as read with custom fields
   ✓ Plugin > Mark notification as read twice
   ✓ Plugin > Fail to read notification due non-existent ID
   ✓ Plugin > Fails marking notifications as read due to non-existent ID

 Test Files  1 passed (1)
      Tests  10 passed (10)
```

## How To: Usage

<!-- TODO maybe?
> [!TIP]
> This initial How-To Guide shows just the general usage to give you an overview of the plugin, for a more specific example check ["Practical Guides"](#practical-guides-and-resources) below.
 -->

The plugin extends the admin API with queries and mutations:

```graphql
extend type Query {
  "Get a single notification"
  channelNotification(id: ID!): ChannelNotification
  "List all notifications for the active user, by default orders by dateTime descending"
  channelNotificationList(options: ChannelNotificationListOptions): ChannelNotificationList!
}

extend type Mutation {
  CreateChannelNotification(input: CreateChannelNotificationInput!): ChannelNotification!
  UpdateChannelNotification(input: UpdateChannelNotificationInput!): ChannelNotification!
  DeleteChannelNotification(input: DeleteChannelNotificationInput!): DeletionResponse!
  MarkChannelNotificationAsRead(input: MarkChannelNotificationAsReadInput!): Success!
}
```

See [api-extensions.ts](https://github.com/DanielBiegler/bieglers-vendure-plugins/blob/master/packages/channel-notifications/src/api/api-extensions.ts) for a complete overview of the graphql extensions and types.

### 1. Add the plugin to your Vendure Config

You can find the package over on [npm](https://www.npmjs.com/package/@danielbiegler/vendure-plugin-channel-notifications) and install it via:

```bash
npm i @danielbiegler/vendure-plugin-channel-notifications
```

Add it to your Vendure Config:

```ts
import { ChannelNotificationsPlugin } from "@danielbiegler/vendure-plugin-channel-notifications";
export const config: VendureConfig = {
  // ...
  plugins: [
    ChannelNotificationsPlugin.init({}),
  ],
}
```

Please refer to the specific [docs](https://github.com/DanielBiegler/bieglers-vendure-plugins/blob/master/packages/channel-notifications/src/types.ts) for how and what you can customize.

### 2. Generate a database migration

This plugin adds new entities, namely:

- `ChannelNotification`
- `ChannelNotificationTranslation`
- `ChannelNotificationReadReceipt`

which requires you to generate a database migration. See Vendure's [migration documentation](https://docs.vendure.io/guides/developer-guide/migrations/) for further guidance.

### 3. Create Roles

You'll probably want to enable some users to create notifications while others are only given read permissions. This plugin adds custom permissions which you can assign in Vendures settings.

### 4. Include Channel-Token

Notifications are [Channel-Aware](#TODO), meaning each channel has their own separate notifications. Given a multi-vendor setup where each vendor is their own Channel, each Vendor can be notified separately, simply by supplying the Channel-Token in the request header.

A short example using ApolloClient in React:

```ts
const { loading, error, data } = useQuery(GET_PRODUCT_LIST, {
    context: {
        headers: {
            'vendure-token': 'my-example-channel-token',
        },
    },
});
```

For more details on how Channels work, see Vendures [Channel Documentation](https://docs.vendure.io/guides/core-concepts/channels/).

### 5. Create a notification

```graphql
# TODO
```

### 6. Consume notifications

1. List paginated notifications

```graphql
# TODO
```

2. Mark them as read

```graphql
#TODO
```

## Practical Guides and Resources

### Guides

- TODO

### Resources

- TODO

---

#### Credits

- Banner Photos created and edited by [Daniel Biegler](https://www.danielbiegler.de/)
