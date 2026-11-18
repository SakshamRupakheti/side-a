import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./auth-schema";

export interface Env {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  LOCAL_PASSWORD_AUTH?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  FACEBOOK_CLIENT_ID?: string;
  FACEBOOK_CLIENT_SECRET?: string;
  PODCAST_INDEX_KEY?: string;
  PODCAST_INDEX_SECRET?: string;
}
export function methods(env: Env) {
  const url = new URL(env.BETTER_AUTH_URL);
  return {
    local:
      env.LOCAL_PASSWORD_AUTH === "true" &&
      ["localhost", "127.0.0.1"].includes(url.hostname) &&
      url.protocol === "http:",
    github: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
    google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    facebook: Boolean(env.FACEBOOK_CLIENT_ID && env.FACEBOOK_CLIENT_SECRET),
  };
}
function buildAuth(env: Env) {
  const enabled = methods(env);
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    onAPIError: { errorURL: new URL("/?signin", env.BETTER_AUTH_URL).href },
    database: drizzleAdapter(drizzle(env.DB), { provider: "sqlite", schema }),
    emailAndPassword: { enabled: enabled.local, minPasswordLength: 12 },
    socialProviders: {
      ...(enabled.github && {
        github: {
          clientId: env.GITHUB_CLIENT_ID!,
          clientSecret: env.GITHUB_CLIENT_SECRET!,
          disableDefaultScope: true,
          scope: ["user:email"],
        },
      }),
      ...(enabled.google && {
        google: {
          clientId: env.GOOGLE_CLIENT_ID!,
          clientSecret: env.GOOGLE_CLIENT_SECRET!,
          includeGrantedScopes: false,
        },
      }),
      ...(enabled.facebook && {
        facebook: {
          clientId: env.FACEBOOK_CLIENT_ID!,
          clientSecret: env.FACEBOOK_CLIENT_SECRET!,
        },
      }),
    },
    rateLimit: { enabled: true, storage: "database" },
    account: { accountLinking: { enabled: false }, encryptOAuthTokens: true },
    advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
  });
}
const authByEnvironment = new WeakMap<Env, ReturnType<typeof buildAuth>>();
export function auth(env: Env) {
  let instance = authByEnvironment.get(env);
  if (!instance) {
    instance = buildAuth(env);
    authByEnvironment.set(env, instance);
  }
  return instance;
}
