import gql from "graphql-tag";

export const createMinimalNotification = gql`
  mutation createMinimalNotification($title: String!) {
    userNotificationCreate(input: {
      translations: [{
        languageCode: en,
        title: $title,
      }]
    }) {
      id
    }
  }
`;
