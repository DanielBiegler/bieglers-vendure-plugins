import gql from "graphql-tag";

export const fragmentNotification = gql`
  fragment all on UserNotification {
    id
    asset { id }
    assetId
    dateTime
    readAt
    
    title
    content

    translations {
      languageCode
      title
      content
    }
  }
`;

export const createMinimalNotification = gql`
  ${fragmentNotification}
  mutation createMinimalNotification($title: String!, $dateTime: DateTime) {
    userNotificationCreate(input: {
      dateTime: $dateTime,
      translations: [{
        languageCode: en,
        title: $title,
      }]
    }) {
      ...all
    }
  }
`;

export const updateNotification = gql`
  ${fragmentNotification}
  mutation updateNotification($input: UserNotificationUpdateInput!) {
    userNotificationUpdate(input: $input) {
      ...all
    }
  }
`;

export const readNotification = gql`
  ${fragmentNotification}
  query readNotification($id: ID!) {
    userNotification(id: $id) {
      ...all
    }
  }
`;

export const readNotificationList = gql`
  ${fragmentNotification}
  query readNotificationList($options: UserNotificationListOptions) {
    userNotificationList(options: $options) {
      totalItems
      items {
        ...all
      }
    }
  }
`;

export const createMinimalChannel = gql`
  mutation createMinimalChannel($code: String!, $token: String!) {
    createChannel(input: {
      code: $code,
      token: $token,
      defaultLanguageCode: en,
      pricesIncludeTax: true,
      currencyCode: USD,
      defaultShippingZoneId: "T_1",
      defaultTaxZoneId: "T_1"
    }) {
      ... on Channel {
        id
        token
      }
    }
  }
`;

export const markAsRead = gql`
  ${fragmentNotification}
  mutation markAsRead($input: UserNotificationMarkAsReadInput!) {
    userNotificationMarkAsRead(input: $input) {
      success
    }
  }
`;
