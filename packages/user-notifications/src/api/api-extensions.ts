import { gql } from "graphql-tag";

export const adminApiExtensions = gql`
  type UserNotification implements Node {
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

    translations: [UserNotificationTranslation!]!
  }

  type UserNotificationTranslation implements Node {
    id: ID!
    createdAt: DateTime!
    updatedAt: DateTime!
    languageCode: LanguageCode!

    title: String!
    content: String
  }

  input UserNotificationTranslationInput {
    # TODO check making distinct types?
    # Only defined for update mutations
    id: ID
    languageCode: LanguageCode!
    title: String!
    content: String
  }

  type UserNotificationList implements PaginatedList {
    items: [UserNotification!]!
    totalItems: Int!
  }
  
  input UserNotificationListOptions

  extend type Query {
    userNotification(id: ID!): UserNotification
    "List all notifications for the active user, by default orders by dateTime descending"
    userNotificationList(options: UserNotificationListOptions): UserNotificationList!
  }

  input UserNotificationCreateInput {
    dateTime: DateTime
    idAsset: ID
    translations: [UserNotificationTranslationInput!]!
  }

  input UserNotificationUpdateInput {
    id: ID!
    dateTime: DateTime
    idAsset: ID
    translations: [UserNotificationTranslationInput!]
  }

  input UserNotificationMarkAsReadInput {
    ids: [ID!]!
    idUser: ID
  }

  extend type Mutation {
    userNotificationCreate(input: UserNotificationCreateInput!): UserNotification!
    userNotificationUpdate(input: UserNotificationUpdateInput!): UserNotification!
    userNotificationDelete(ids: [ID!]!): DeletionResponse!
    userNotificationMarkAsRead(input: UserNotificationMarkAsReadInput!): [UserNotification!]!
  }
`;
