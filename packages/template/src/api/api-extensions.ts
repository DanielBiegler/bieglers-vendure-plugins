import { gql } from "graphql-tag";

export const adminApiExtensions = gql`

  # In case you need a field resolver for result unions
  #
  # type Plugin__SCAFFOLD_TITLE_NO_SPACE__Result {
  #   # TODO
  # }
  # union Plugin__SCAFFOLD_TITLE_NO_SPACE__CreateResult = Asset | Plugin__SCAFFOLD_TITLE_NO_SPACE__Result

  extend type Query {
    # TODO
  }

  extend type Mutation {
    # TODO
  }
`;
