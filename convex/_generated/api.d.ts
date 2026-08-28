/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ResendOTPPasswordReset from "../ResendOTPPasswordReset.js";
import type * as analytics from "../analytics.js";
import type * as auth from "../auth.js";
import type * as bookings from "../bookings.js";
import type * as catalogues from "../catalogues.js";
import type * as cron_jobs from "../cron_jobs.js";
import type * as crons from "../crons.js";
import type * as emails from "../emails.js";
import type * as emailsInternal from "../emailsInternal.js";
import type * as events from "../events.js";
import type * as googleAccount from "../googleAccount.js";
import type * as googleActions from "../googleActions.js";
import type * as googleCalendarChannels from "../googleCalendarChannels.js";
import type * as googleHelpers from "../googleHelpers.js";
import type * as http from "../http.js";
import type * as invitations from "../invitations.js";
import type * as leads from "../leads.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_disqualification from "../lib/disqualification.js";
import type * as lib_emailTemplates from "../lib/emailTemplates.js";
import type * as lib_leadMatch from "../lib/leadMatch.js";
import type * as lib_slotComputation from "../lib/slotComputation.js";
import type * as lib_tz from "../lib/tz.js";
import type * as migrations from "../migrations.js";
import type * as migrationsNode from "../migrationsNode.js";
import type * as notifyDispatch from "../notifyDispatch.js";
import type * as partialLeads from "../partialLeads.js";
import type * as seed from "../seed.js";
import type * as setupStatus from "../setupStatus.js";
import type * as stripe from "../stripe.js";
import type * as userAvailability from "../userAvailability.js";
import type * as userCalendarSettings from "../userCalendarSettings.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ResendOTPPasswordReset: typeof ResendOTPPasswordReset;
  analytics: typeof analytics;
  auth: typeof auth;
  bookings: typeof bookings;
  catalogues: typeof catalogues;
  cron_jobs: typeof cron_jobs;
  crons: typeof crons;
  emails: typeof emails;
  emailsInternal: typeof emailsInternal;
  events: typeof events;
  googleAccount: typeof googleAccount;
  googleActions: typeof googleActions;
  googleCalendarChannels: typeof googleCalendarChannels;
  googleHelpers: typeof googleHelpers;
  http: typeof http;
  invitations: typeof invitations;
  leads: typeof leads;
  "lib/auth": typeof lib_auth;
  "lib/disqualification": typeof lib_disqualification;
  "lib/emailTemplates": typeof lib_emailTemplates;
  "lib/leadMatch": typeof lib_leadMatch;
  "lib/slotComputation": typeof lib_slotComputation;
  "lib/tz": typeof lib_tz;
  migrations: typeof migrations;
  migrationsNode: typeof migrationsNode;
  notifyDispatch: typeof notifyDispatch;
  partialLeads: typeof partialLeads;
  seed: typeof seed;
  setupStatus: typeof setupStatus;
  stripe: typeof stripe;
  userAvailability: typeof userAvailability;
  userCalendarSettings: typeof userCalendarSettings;
  users: typeof users;
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
