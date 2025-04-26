![Banner Image](https://raw.githubusercontent.com/DanielBiegler/bieglers-vendure-plugins/master/packages/user-registration-guard/assets/thumbnail_16x9.png)

# Vendure Plugin: User Registration Guard

Let's you flexibly customize if and how you prevent users from registering with your Vendure instance.

For example, reduce fraud by blocking disposable email providers or IP ranges from registering with your Vendure instance or harden your admin accounts by only allowing specific domains in email addresses.

<a href="https://www.npmjs.com/package/@danielbiegler/vendure-plugin-user-registration-guard" target="_blank">
  <img src="https://badge.fury.io/js/@danielbiegler%2Fvendure-plugin-user-registration-guard.svg" alt="npm version badge" height="18">
</a>

## Features

- Let's you create arbitrarily complex assertions for Customer registrations and Administrator creations
- Logical operators (`AND`, `OR`) for when you have multiple checks
- Publishes a [`UserRegistrationBlockedEvent`](./src/events/user-registration-blocked.event.ts) on the [EventBus](https://docs.vendure.io/guides/developer-guide/events/) for your consumption, for example if you'd like to monitor failed attempts
- Works via [Nestjs Interceptor](https://docs.nestjs.com/interceptors) and does not(!) override the existing mutation APIs ([`registerCustomerAccount`](https://docs.vendure.io/reference/graphql-api/shop/mutations#registercustomeraccount), [`createAdministrator`](https://docs.vendure.io/reference/graphql-api/admin/mutations#createadministrator)), which makes this plugin integrate seamlessly with your own [resolver overrides](https://docs.vendure.io/guides/developer-guide/extend-graphql-api/#override-built-in-resolvers)
- Nicely commented and documented
- No dependencies

### End-To-End Tests

```
 ✓ user-registration-guard/e2e/email.e2e-spec.ts (4)
 ✓ user-registration-guard/e2e/ip.e2e-spec.ts (2)
 ✓ user-registration-guard/e2e/logical-and_fail.e2e-spec.ts (2)
 ✓ user-registration-guard/e2e/logical-and_ok.e2e-spec.ts (2)
 ✓ user-registration-guard/e2e/logical-or_fail.e2e-spec.ts (2)
 ✓ user-registration-guard/e2e/logical-or_ok.e2e-spec.ts (2)
 ✓ user-registration-guard/e2e/reject.e2e-spec.ts (2)

 Test Files  7 passed (7)
      Tests  16 passed (16)
```

## Example

TODO

## How To: Usage

TODO

---

#### Credits

- Traffic Light Photo by Caroline Cagnin from [Pexels](https://www.pexels.com/photo/white-building-with-fire-escape-stairs-1786758/), edited by [Daniel Biegler](https://www.danielbiegler.de/)
