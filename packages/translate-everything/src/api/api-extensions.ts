import { gql } from "graphql-tag";

export const adminSchema = gql`
  """
  Helps differentiate between what specific field was translated.
  """
  enum TranslateEverythingEntryKindProduct {
    NAME
    DESCRIPTION
    SLUG
    CUSTOMFIELD # TODO check this
  }

  interface TranslateEverythingEntry implements Node {
    id: ID!
    createdAt: DateTime!
    updatedAt: DateTime!

    adminId: ID!
    admin: Administrator!

    sourceLanguage: LanguageCode!
    targetLanguage: LanguageCode!

    sourceText: String!
    targetText: String!

    # TODO customfields
  }

  type TranslateEverythingEntryProduct implements TranslateEverythingEntry & Node {
    id: ID!
    createdAt: DateTime!
    updatedAt: DateTime!

    adminId: ID!
    admin: Administrator!

    sourceLanguage: LanguageCode!
    targetLanguage: LanguageCode!

    sourceText: String!
    targetText: String!

    """
    Helps differentiate between what specific field was translated.
    """
    translationKind: TranslateEverythingEntryKindProduct!
  }

  type TranslateEverythingEntryProductList implements PaginatedList {
    items: [TranslateEverythingEntryProduct!]!
    totalItems: Int!
  }

  # Generated at run-time by Vendure
  input TranslateEverythingEntryProductListOptions

  extend type Query {
    translateEverythingEntryProduct(id: ID!): TranslateEverythingEntryProduct!
    translateEverythingEntryProducts(
      options: TranslateEverythingEntryProductListOptions
    ): TranslateEverythingEntryProductList!
  }

  input TranslateProductInput {
    productId: ID!
    sourceLanguage: LanguageCode!
    targetLanguage: LanguageCode!
  }

  extend type Mutation {
    # TODO rather return a union with notfound etc or throw error?
    # union is nice because its explicit and typed
    translateProduct(input: TranslateProductInput!): Product!
  }
`;
