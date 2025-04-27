import { OnModuleInit } from "@nestjs/common";
import { EventBus, EventBusModule, VendurePlugin } from "@vendure/core";
import { createTestEnvironment } from "@vendure/testing";
import path from "path";
import { lastValueFrom, ReplaySubject } from "rxjs";
import { afterAll, beforeAll, beforeEach, describe, test, vi } from "vitest";
import { initialData } from "../../../utils/e2e/e2e-initial-data";
import { testConfig } from "../../../utils/e2e/test-config";
import {
  BlockedCreateAdministratorEvent,
  BlockedCustomerRegistrationEvent,
} from "../src/events/user-registration-blocked.event";
import { MutationCreateAdministratorArgs } from "../src/generated-admin-types";
import { MutationRegisterCustomerAccountArgs } from "../src/generated-shop-types";
import { UserRegistrationGuardPlugin } from "../src/user-registration-guard.plugin";
import { blockExampleDotCom } from "./fixtures/assertions";
import { CREATE_ADMIN } from "./graphql/admin-e2e-definitions";
import { REGISTER_CUSTOMER } from "./graphql/shop-e2e-definitions";
import { CreateMutation, CreateMutationVariables } from "./types/generated-admin-types";
import { RegisterMutation, RegisterMutationVariables } from "./types/generated-shop-types";

/**
 * Test plugin so we can prove that we are publishing events when appropriate
 */
@VendurePlugin({ imports: [EventBusModule] })
class TestEventSubscriberPlugin implements OnModuleInit {
  static blockedCustomerRegistrationEventFired = vi.fn();
  static blockedCreateAdminEventFired = vi.fn();
  static eventHandlerComplete$ = new ReplaySubject(1);

  static reset() {
    this.eventHandlerComplete$ = new ReplaySubject(1);
    this.blockedCustomerRegistrationEventFired.mockClear();
    this.blockedCreateAdminEventFired.mockClear();
  }

  constructor(private eventBus: EventBus) {}

  onModuleInit() {
    this.eventBus
      .ofType(BlockedCustomerRegistrationEvent<MutationRegisterCustomerAccountArgs>)
      .subscribe(async (event) => {
        TestEventSubscriberPlugin.blockedCustomerRegistrationEventFired();
        TestEventSubscriberPlugin.eventHandlerComplete$.next(event);
        TestEventSubscriberPlugin.eventHandlerComplete$.complete();
      });

    this.eventBus.ofType(BlockedCreateAdministratorEvent<MutationCreateAdministratorArgs>).subscribe(async (event) => {
      TestEventSubscriberPlugin.blockedCreateAdminEventFired();
      TestEventSubscriberPlugin.eventHandlerComplete$.next(event);
      TestEventSubscriberPlugin.eventHandlerComplete$.complete();
    });
  }
}

/**
 * This suite must not be concurrent because we're using a static property which
 * would interfere with next tests.
 */
describe("EventBus", { concurrent: false, sequential: true }, async () => {
  const { server, adminClient, shopClient } = createTestEnvironment({
    ...testConfig(8008),
    plugins: [
      UserRegistrationGuardPlugin.init({
        shop: {
          assert: {
            logicalOperator: "AND",
            functions: [blockExampleDotCom],
          },
        },
        admin: {
          assert: {
            logicalOperator: "AND",
            functions: [blockExampleDotCom],
          },
        },
      }),
      TestEventSubscriberPlugin,
    ],
  });

  beforeAll(async () => {
    await server.init({
      productsCsvPath: path.join(__dirname, "../../../utils/e2e/e2e-products-full.csv"),
      initialData: initialData,
      customerCount: 2,
    });
    await adminClient.asSuperAdmin();
  }, 60000);

  afterAll(async () => {
    await server.destroy();
  });

  /**
   * Important to reset in between tests because we're using the static property
   * which would interfere with the next tests. This is also why this suite is sequential.
   */
  beforeEach(() => TestEventSubscriberPlugin.reset());

  test("Successfully publish BlockedCustomerRegistrationEvent when blocking", async ({ expect }) => {
    const res = await shopClient.query<RegisterMutation, RegisterMutationVariables>(REGISTER_CUSTOMER, {
      input: { emailAddress: "example@example.com" },
    });

    expect(res.registerCustomerAccount.__typename).toStrictEqual("NativeAuthStrategyError");

    const event = await lastValueFrom(TestEventSubscriberPlugin.eventHandlerComplete$, { defaultValue: null });

    expect(TestEventSubscriberPlugin.blockedCustomerRegistrationEventFired).toHaveBeenCalledOnce();
    expect(TestEventSubscriberPlugin.blockedCreateAdminEventFired).not.toHaveBeenCalled();
    expect(event).toBeInstanceOf(BlockedCustomerRegistrationEvent);
  });

  test("Publish no event on success, for customer", async ({ expect }) => {
    const res = await shopClient.query<RegisterMutation, RegisterMutationVariables>(REGISTER_CUSTOMER, {
      input: { emailAddress: "example@foo.com" },
    });

    expect(res.registerCustomerAccount.__typename).toStrictEqual("Success");

    // Wait a little to make sure we didnt publish anything
    setTimeout(() => TestEventSubscriberPlugin.eventHandlerComplete$.complete(), 500);
    const event = await lastValueFrom(TestEventSubscriberPlugin.eventHandlerComplete$, { defaultValue: null });

    expect(TestEventSubscriberPlugin.blockedCustomerRegistrationEventFired).not.toHaveBeenCalled();
    expect(TestEventSubscriberPlugin.blockedCreateAdminEventFired).not.toHaveBeenCalled();
    expect(event).toBeNull();
  });

  test("Successfully publish BlockedCreateAdministratorEvent when blocking", async ({ expect }) => {
    const res = adminClient.query<CreateMutation, CreateMutationVariables>(CREATE_ADMIN, {
      input: {
        emailAddress: "example@example.com",
        firstName: "",
        lastName: "",
        password: "",
        roleIds: [],
      },
    });

    await expect(res).rejects.toThrow("NativeAuthStrategyError");

    const event = await lastValueFrom(TestEventSubscriberPlugin.eventHandlerComplete$, { defaultValue: null });

    expect(TestEventSubscriberPlugin.blockedCustomerRegistrationEventFired).not.toHaveBeenCalled();
    expect(TestEventSubscriberPlugin.blockedCreateAdminEventFired).toHaveBeenCalledOnce();
    expect(event).toBeInstanceOf(BlockedCreateAdministratorEvent);
  });

  test("Publish no event on success, for admin", async ({ expect }) => {
    const res = await adminClient.query<CreateMutation, CreateMutationVariables>(CREATE_ADMIN, {
      input: {
        emailAddress: "example@admin.com",
        firstName: "",
        lastName: "",
        password: "",
        roleIds: [],
      },
    });

    expect(res.createAdministrator.__typename).toStrictEqual("Administrator");

    // Wait a little to make sure we didnt publish anything
    setTimeout(() => TestEventSubscriberPlugin.eventHandlerComplete$.complete(), 500);
    const event = await lastValueFrom(TestEventSubscriberPlugin.eventHandlerComplete$, { defaultValue: null });

    expect(TestEventSubscriberPlugin.blockedCustomerRegistrationEventFired).not.toHaveBeenCalled();
    expect(TestEventSubscriberPlugin.blockedCreateAdminEventFired).not.toHaveBeenCalled();
    expect(event).toBeNull();
  });
});
