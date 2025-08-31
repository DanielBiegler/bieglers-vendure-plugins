import { gql } from "graphql-tag";

export const adminApiExtensions = gql`

  # In case you need a field resolver for result unions
  #
  # type PluginUserNotificationsResult {
  #   # TODO
  # }
  # union PluginUserNotificationsCreateResult = Asset | PluginUserNotificationsResult

  extend type Query {
    # TODO
  }

  extend type Mutation {
    # TODO
  }
`;
