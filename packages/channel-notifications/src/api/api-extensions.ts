import { gql } from "graphql-tag";

export const adminApiExtensions = gql`
  type ChannelNotification implements Node {
    id: ID!
    createdAt: DateTime!
    updatedAt: DateTime!
        
    "Used for default ordering, sorts in descending order to show last notification first."
    dateTime: DateTime!
    "Headline or title of the notification"
    title: String!
    "Main content of the notification, depending on your needs you might want to use plain text, markdown, something else"
    content: String

    "This gets resolved for the active user"
    readAt: DateTime
    "This gets resolved for the active user"
    readReceipt: ChannelNotificationReadReceipt  # TODO maybe remove this

    translations: [ChannelNotificationTranslation!]!
  }

  type ChannelNotificationReadReceipt implements Node {
    id: ID!
    createdAt: DateTime!
    updatedAt: DateTime!

    user: User!
    userId: ID!
    notification: ChannelNotification!
    notificationId: ID!
    dateTime: DateTime!
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

  input CreateChannelNotificationTranslationInput {
    languageCode: LanguageCode!
    
    "Headline or title of the notification"
    title: String!
    "Main content of the notification, depending on your needs you might want to use plain text, markdown, something else"
    content: String
  }

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
    translations: [CreateChannelNotificationTranslationInput!]!
  }

  input UpdateChannelNotificationInput {
    id: ID!
    dateTime: DateTime
    translations: [UpdateChannelNotificationTranslationInput!]
  }

  input DeleteChannelNotificationInput {
    id: ID!
  }

  input MarkChannelNotificationAsReadInput {
    id: ID!
    readReceiptCustomFields: JSON
  }

  extend type Mutation {
    CreateChannelNotification(input: CreateChannelNotificationInput!): ChannelNotification!
    UpdateChannelNotification(input: UpdateChannelNotificationInput!): ChannelNotification!
    DeleteChannelNotification(input: DeleteChannelNotificationInput!): DeletionResponse!
    MarkChannelNotificationAsRead(input: MarkChannelNotificationAsReadInput!): Success!
  }
`;
