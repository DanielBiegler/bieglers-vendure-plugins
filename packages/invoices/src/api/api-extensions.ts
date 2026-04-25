import { gql } from "graphql-tag";

// TODO custom fields
export const adminApiExtensions = gql`

  # In case you need a field resolver for result unions
  #
  # type PluginInvoicesResult {
  #   # TODO
  # }
  # union PluginInvoicesCreateResult = Asset | PluginInvoicesResult

  type Invoice implements Node {
    id: ID!
    createdAt: DateTime!
    updatedAt: DateTime!

    invoiceId: String!
    assetUrl: String!
  }

  type InvoiceConfig implements Node {
    id: ID!
    createdAt: DateTime!
    updatedAt: DateTime!

    sequence: Int!
  }

  extend type Mutation {
    pluginInvoicesExample: Boolean
  }
`;
