import gql from "graphql-tag";

export const CREATE_ADMIN = gql`
  mutation create($input: CreateAdministratorInput!) {
    createAdministrator(input: $input) {
      __typename
    }
  }
`;
