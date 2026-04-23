import { gql } from "graphql-tag";

export const adminApiExtensions = gql`

  # In case you need a field resolver for result unions
  #
  # type PluginInvoicesResult {
  #   # TODO
  # }
  # union PluginInvoicesCreateResult = Asset | PluginInvoicesResult

  extend type Query {
    # TODO
  }

  extend type Mutation {
    # TODO
  }
`;
