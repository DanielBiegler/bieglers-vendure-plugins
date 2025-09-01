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

export const updateNotification = gql`
  mutation updateNotification($input: UserNotificationUpdateInput!) {
    userNotificationUpdate(input: $input) {
      id
      asset { id }
      assetId
      dateTime
      
      title
      content

      translations {
        languageCode
        title
        content
      }
    }
  }
`;
