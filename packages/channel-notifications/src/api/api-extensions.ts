import { gql } from "graphql-tag";

export const adminApiExtensions = gql`
  type ChannelNotification implements Node {
    id: ID!
    createdAt: DateTime!
    updatedAt: DateTime!
    
    "For potentially displaying a thumbnail/banner in the notification or attaching a file"
    asset: Asset
    "See if there is a connected asset without needing to resolve the full asset"
    assetId: ID
    "Used for ordering, would also be the time for a changelog"
    dateTime: DateTime
    "Headline or title of the notification"
    title: String!
    "Main content of the notification, depending on your needs you might want to use plain text, markdown, something else"
    content: String
    "This gets resolved for the active user"
    readAt: DateTime

    translations: [ChannelNotificationTranslation!]!
  }

  type ChannelNotificationTranslation implements Node {
    id: ID!
    createdAt: DateTime!
    updatedAt: DateTime!
    languageCode: LanguageCode!

    title: String!
    content: String
  }

  input ChannelNotificationTranslationInput {
    # TODO check making distinct types?
    # Only defined for update mutations
    id: ID
    languageCode: LanguageCode!
    title: String!
    content: String
  }

  type ChannelNotificationList implements PaginatedList {
    items: [ChannelNotification!]!
    totalItems: Int!
  }
  
  input ChannelNotificationListOptions

  extend type Query {
    channelNotification(id: ID!): ChannelNotification
    "List all notifications for the active user, by default orders by dateTime descending"
    channelNotificationList(options: ChannelNotificationListOptions): ChannelNotificationList!
  }

  input ChannelNotificationCreateInput {
    dateTime: DateTime
    idAsset: ID
    translations: [ChannelNotificationTranslationInput!]!
  }

  input ChannelNotificationUpdateInput {
    id: ID!
    dateTime: DateTime
    idAsset: ID
    translations: [ChannelNotificationTranslationInput!]
  }

  input ChannelNotificationMarkAsReadInput {
    ids: [ID!]!
  }

  extend type Mutation {
    channelNotificationCreate(input: ChannelNotificationCreateInput!): ChannelNotification!
    channelNotificationUpdate(input: ChannelNotificationUpdateInput!): ChannelNotification!
    channelNotificationDelete(ids: [ID!]!): DeletionResponse!
    channelNotificationMarkAsRead(input: ChannelNotificationMarkAsReadInput!): Success!
  }
`;
