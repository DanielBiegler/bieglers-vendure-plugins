import { gql } from "graphql-tag";

export const adminApiExtensions = gql`
  type ChannelNotification implements Node {
    id: ID!
    createdAt: DateTime!
    updatedAt: DateTime!
    
    # TODO maybe user?
    # author: User
    
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

  # TODO DOES THIS GENERATE CUSTOM FIELDS TYPE???????????
  type ChannelNotificationTranslation implements Node {
    id: ID!
    createdAt: DateTime!
    updatedAt: DateTime!
    languageCode: LanguageCode!

    "Headline or title of the notification"
    title: String!
    "Main content of the notification, depending on your needs you might want to use plain text, markdown, something else"
    content: String
  }

  # TODO check making distinct types?
  input CreateChannelNotificationTranslationInput {
    languageCode: LanguageCode!
    
    "Headline or title of the notification"
    title: String!
    "Main content of the notification, depending on your needs you might want to use plain text, markdown, something else"
    content: String
  }

  # TODO check making distinct types?
  input UpdateChannelNotificationTranslationInput {
    id: ID
    languageCode: LanguageCode!
    
    "Headline or title of the notification"
    title: String
    "Main content of the notification, depending on your needs you might want to use plain text, markdown, something else"
    content: String
  }

  type ChannelNotificationList implements PaginatedList {
    items: [ChannelNotification!]!
    totalItems: Int!
  }
  
  input ChannelNotificationListOptions

  extend type Query {
    "Get a single notification"
    channelNotification(id: ID!): ChannelNotification
    "List all notifications for the active user, by default orders by dateTime descending"
    channelNotificationList(options: ChannelNotificationListOptions): ChannelNotificationList!
  }

  input CreateChannelNotificationInput {
    dateTime: DateTime
    idAsset: ID
    translations: [CreateChannelNotificationTranslationInput!]!
  }

  input UpdateChannelNotificationInput {
    id: ID!
    dateTime: DateTime
    idAsset: ID
    translations: [UpdateChannelNotificationTranslationInput!]
  }

  input DeleteChannelNotificationInput {
    id: ID!
  }

  input MarkChannelNotificationAsReadInput {
    ids: [ID!]!
    # TODO maybe include customFields here and make it only create one
  }

  extend type Mutation {
    CreateChannelNotification(input: CreateChannelNotificationInput!): ChannelNotification!
    UpdateChannelNotification(input: UpdateChannelNotificationInput!): ChannelNotification!
    DeleteChannelNotification(input: DeleteChannelNotificationInput!): DeletionResponse!
    MarkChannelNotificationAsRead(input: MarkChannelNotificationAsReadInput!): Success!
  }
`;
