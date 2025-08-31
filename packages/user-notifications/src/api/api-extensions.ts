import { gql } from "graphql-tag";

export const adminApiExtensions = gql`
  type UserNotification implements Node {
    id: ID!
    createdAt: DateTime!
    updatedAt: DateTime!
    
    "For potentially displaying a thumbnail/banner in the notification or attaching a file"
    asset: Asset
    "Used for ordering, would also be the time for a changelog"
    dateTime: DateTime
    "Headline or title of the notification"
    title: String!
    "Main content of the notification, depending on your needs you might want to use plain text, markdown, something else"
    content: String
    "This gets resolved for the active user"
    readAt: DateTime
  }

  type UserNotificationList implements PaginatedList {
    items: [UserNotification!]!
    totalItems: Int!
  }
  
  input UserNotificationListOptions

  extend type Query {
    userNotification(id: ID!): UserNotification!
    "List all notifications for the active user, by default orders by dateTime descending"
    userNotificationList(options: UserNotificationListOptions): UserNotificationList!
  }

  input PluginUserNotificationCreateInput {
    title: String!
    dateTime: DateTime
    content: String
    imageId: ID
  }

  input PluginUserNotificationUpdateInput {
    id: ID!
    title: String
    dateTime: DateTime
    content: String
    imageId: ID
  }

  input UserNotificationMarkAsReadInput {
    ids: [ID!]!
    userId: ID
  }

  extend type Mutation {
    userNotificationCreate(input: PluginUserNotificationCreateInput!): UserNotification!
    userNotificationUpdate(input: PluginUserNotificationUpdateInput!): UserNotification!
    userNotificationDelete(ids: [ID!]!): DeletionResponse!
    userNotificationMarkAsRead(input: UserNotificationMarkAsReadInput!): [UserNotification!]!
  }
`;
