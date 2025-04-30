import { gql } from "graphql-tag";

export const adminSchema = gql`
  """
  Helps differentiate between what specific field was translated.
  """
  enum TranslateEverythingProductKind {
    NAME
    DESCRIPTION
    SLUG
    # TODO customfield stuff? check how needed/feasible later.
  }

  type TranslateEverythingEntry implements Node {
    id: ID!
    createdAt: DateTime!
    updatedAt: DateTime!

    adminId: ID!
    admin: Administrator!

    """
    Helps differentiate between what specific field was translated.
    """
    translationKind: TranslateEverythingProductKind!

    sourceLanguage: LanguageCode!
    targetLanguage: LanguageCode!

    sourceText: String!
    targetText: String!

    # TODO maybe add m2a type fields so you can find

    # TODO customfields
  }

  type TranslateEverythingEntryList implements PaginatedList {
    items: [TranslateEverythingEntry!]!
    totalItems: Int!
  }

  # Generated at run-time by Vendure
  input TranslateEverythingEntryListOptions

  extend type Query {
    translateEverythingEntry(id: ID!): TranslateEverythingEntry!
    translateEverythingEntries(options: TranslateEverythingEntryListOptions): TranslateEverythingEntryList!
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
