import { gql } from "graphql-tag";

export const adminApiExtensions = gql`

  # In case you need a field resolver for result unions
  #
  # type PluginDBOSJobQueueResult {
  #   # TODO
  # }
  # union PluginDBOSJobQueueCreateResult = Asset | PluginDBOSJobQueueResult

  extend type Query {
    # TODO
  }

  extend type Mutation {
    # TODO
  }
`;
