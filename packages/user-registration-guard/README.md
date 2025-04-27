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
- Publishes a [`BlockedCustomerRegistrationEvent`](./src/events/user-registration-blocked.event.ts) or [`BlockedCreateAdministratorEvent`](./src/events/user-registration-blocked.event.ts) on the [EventBus](https://docs.vendure.io/guides/developer-guide/events/) for your consumption, for example if you'd like to monitor failed attempts
- Works via [Nestjs Interceptor](https://docs.nestjs.com/interceptors) and does not(!) override the existing mutation APIs ([`registerCustomerAccount`](https://docs.vendure.io/reference/graphql-api/shop/mutations#registercustomeraccount), [`createAdministrator`](https://docs.vendure.io/reference/graphql-api/admin/mutations#createadministrator)), which makes this plugin integrate seamlessly with your own [resolver overrides](https://docs.vendure.io/guides/developer-guide/extend-graphql-api/#override-built-in-resolvers)
  - Also supports TypeScript Generics so you can use your own extended types!
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

## How To: Usage

The plugin does not extend the API, has no dependencies and requires no migration.

### 1. Add the plugin to your Vendure Config

You can find the package over on [npm](https://www.npmjs.com/package/@danielbiegler/vendure-plugin-user-registration-guard) and install it via:

```bash
npm i @danielbiegler/vendure-plugin-user-registration-guard
```

```ts
import { UserRegistrationGuardPlugin } from "@danielbiegler/vendure-plugin-user-registration-guard";
export const config: VendureConfig = {
  // ...
  plugins: [
    UserRegistrationGuardPlugin.init({
      shop: {
        assert: {
          /* AND means every single assertion must
             be true to allow user registration */
          logicalOperator: "AND",
          functions: [ /* Insert your assertions here */ ],
        },
      },
      admin: {
        assert: {
          /* OR means user registration is allowed
             if a single assertion is true */
          logicalOperator: "OR",
          functions: [ /* You may leave this empty too */ ],
        },
      },
    }),
  ],
}
```

Please refer to the specific [docs](./src/types.ts) for how and what you can customize.

### 2. Create an assertion

Here's an example assertion where we block customer registrations if the email ends with `example.com`:

```ts
const blockExampleDotCom: AssertFunctionShopApi = async (ctx, args) => {
  const isAllowed = !args.input.emailAddress.endsWith("example.com");
  return {
    isAllowed,
    reason: !isAllowed ? 'Failed because email ends with "example.com"' : undefined,
  };
};
```

The `reason` field is helpful for when you're subscribing to the published [events](./src/events/user-registration-blocked.event.ts) and want to log or understand why somebody got blocked.

In your assertions you'll receive the [`RequestContext`](https://docs.vendure.io/reference/typescript-api/request/request-context) and the GraphQL arguments of the mutation, which by default are either [`RegisterCustomerInput`](https://docs.vendure.io/reference/graphql-api/shop/input-types#registercustomerinput) or [`CreateAdministratorInput`](https://docs.vendure.io/reference/graphql-api/admin/input-types#createadministratorinput) depending on the API type. For example, if you'd like to block IP ranges you can access the underlying [Express Request](https://docs.vendure.io/reference/typescript-api/request/request-context#req) object through the `RequestContext` .

If you've extended your GraphQL API types you may override the TypeScript Generic to get completions in your assertion functions like so:

```ts
const example: AssertFunctionShopApi<{ example: boolean; /* ... */ }> = async (ctx, args) => {
  return { isAllowed: args.example };
};
```

### 3. Add it to the plugin

```ts
import { UserRegistrationGuardPlugin } from "@danielbiegler/vendure-plugin-user-registration-guard";
export const config: VendureConfig = {
  // ...
  plugins: [
    UserRegistrationGuardPlugin.init({
      shop: {
        assert: {
          logicalOperator: "AND",
          functions: [ blockExampleDotCom ],
        },
      },
      admin: {
        assert: {
          logicalOperator: "AND",
          functions: [],
        },
      },
    }),
  ],
}
```

### 4. Try registering new customers

```graphql
mutation {
  registerCustomerAccount(input: {
    emailAddress: "example@example.com",
    # ...
  }) {
    __typename
  }
}
```

This user will now be blocked from registering according to our `blockExampleDotCom` assertion.

#### Handling errors

The plugin is non-intrusive and does not extend the API itself to avoid introducing unhandled errors in your code.

It respects [`RegisterCustomerAccountResult`](https://docs.vendure.io/reference/graphql-api/shop/object-types#registercustomeraccountresult) being a Union, so we don't throw an error, but return a [`NativeAuthStrategyError`](https://docs.vendure.io/reference/graphql-api/shop/object-types#nativeauthstrategyerror). You may handle the error just like the other `RegisterCustomerAccountResult` types like [`PasswordValidationError`](https://docs.vendure.io/reference/graphql-api/shop/object-types#passwordvalidationerror) for example.

In contrast, for admins we do throw the error! This is a little different because by default the [`createAdministrator`](https://docs.vendure.io/reference/graphql-api/admin/mutations#createadministrator) mutation does not return a Union with error types.

Granted, the `NativeAuthStrategyError` is technically not correct for blocking registrations and doesn't communicate the blocking properly, but it's the only reasonable error type in the Union for a default non-api-extended Vendure instance. You might want to add some comments in your registration logic that the error means blockage.

### 5. Subscribe to events

You may want to [subscribe](https://docs.vendure.io/guides/developer-guide/events/#subscribing-to-events) to the [EventBus](https://docs.vendure.io/reference/typescript-api/events/event-bus) to monitor blocked registration attempts.

```ts
this.eventBus
  .ofType(BlockedCustomerRegistrationEvent<MutationRegisterCustomerAccountArgs>)
  .subscribe(async (event) => {
    const rejecteds = event.assertions.filter((a) => !a.isAllowed);
    console.log(`Blocked customer registration! ${rejecteds.length}/${event.assertions.length} assertions failed, see reasons:`);
    rejecteds.forEach(r => console.log("  -", r.reason));

    // Example output:
    // Blocked customer registration! 1/1 assertions failed, see reasons:
    //   - Failed because email ends with "example.com"
  });

this.eventBus
  // You can even override the passed in args if you've extended your Graphql API
  .ofType(BlockedCreateAdministratorEvent<{ example: boolean }>).subscribe(async (event) => {
    event.args.example // is typed now! :)
  });
```

---

#### Credits

- Traffic Light Photo by Caroline Cagnin from [Pexels](https://www.pexels.com/photo/white-building-with-fire-escape-stairs-1786758/), edited by [Daniel Biegler](https://www.danielbiegler.de/)
