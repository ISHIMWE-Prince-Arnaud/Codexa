/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actions from "../actions.js";
import type * as codeExecutions from "../codeExecutions.js";
import type * as constants from "../constants.js";
import type * as http from "../http.js";
import type * as lemonSqueezy from "../lemonSqueezy.js";
import type * as rateLimit from "../rateLimit.js";
import type * as snippets from "../snippets.js";
import type * as users from "../users.js";
import type * as webhookHelpers from "../webhookHelpers.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  actions: typeof actions;
  codeExecutions: typeof codeExecutions;
  constants: typeof constants;
  http: typeof http;
  lemonSqueezy: typeof lemonSqueezy;
  rateLimit: typeof rateLimit;
  snippets: typeof snippets;
  users: typeof users;
  webhookHelpers: typeof webhookHelpers;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
