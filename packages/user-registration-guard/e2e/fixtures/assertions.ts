import { AssertFunctionShopApi } from "../../src";

export const blockExampleDotCom: AssertFunctionShopApi = async (ctx, args) => {
  const isAllowed = !args.input.emailAddress.endsWith("example.com");
  return {
    isAllowed,
    reason: !isAllowed ? 'Failed because email ends with "example.com"' : undefined,
  };
};

export const onlyAllowLocalIp: AssertFunctionShopApi = async (ctx, args) => {
  // `includes` instead of strict comparison because local ips may include other bits
  return {
    isAllowed: ctx.req?.ip?.includes("127.0.0.1") ?? false,
  };
};

export const alwaysTrue: AssertFunctionShopApi = async (ctx, input) => {
  return { isAllowed: true };
};

export const alwaysFalse: AssertFunctionShopApi = async (ctx, input) => {
  return { isAllowed: false };
};

export const alwaysThrows: AssertFunctionShopApi = async (ctx, input) => {
  throw new Error();
};
