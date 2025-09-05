import gql from "graphql-tag";

export const fragmentNotification = gql`
  fragment all on ChannelNotification {
    id
    dateTime
    readAt
    readReceipt {
      id
      notificationId
      userId
      dateTime
    }
    
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
    CreateChannelNotification(input: {
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

export const createNotification = gql`
  ${fragmentNotification}
  mutation createNotification($input: CreateChannelNotificationInput!) {
    CreateChannelNotification(input: $input) {
      ...all
    }
  }
`;

export const updateNotification = gql`
  ${fragmentNotification}
  mutation updateNotification($input: UpdateChannelNotificationInput!) {
    UpdateChannelNotification(input: $input) {
      ...all
    }
  }
`;

export const deleteNotification = gql`
  mutation deleteNotification($input: DeleteChannelNotificationInput!) {
    DeleteChannelNotification(input: $input) {
      result
      message
    }
  }
`;

export const readNotification = gql`
  ${fragmentNotification}
  query readNotification($id: ID!) {
    channelNotification(id: $id) {
      ...all
    }
  }
`;

export const readNotificationList = gql`
  ${fragmentNotification}
  query readNotificationList($options: ChannelNotificationListOptions) {
    channelNotificationList(options: $options) {
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

export const createMinimalAdmin = gql`
  mutation createMinimalAdmin($input: CreateAdministratorInput!) {
    createAdministrator(input: $input) {
      id
      user { id }
    }
  }
`;

export const createRole = gql`
  mutation createRole($input: CreateRoleInput!) {
    createRole(input: $input) {
      id
    }
  }
`;

export const markAsRead = gql`
  ${fragmentNotification}
  mutation markAsRead($input: MarkChannelNotificationAsReadInput!) {
    MarkChannelNotificationAsRead(input: $input) {
      success
    }
  }
`;
