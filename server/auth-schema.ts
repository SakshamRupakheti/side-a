import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const id = () => text("id").primaryKey();
const time = (column: string) =>
  integer(column, { mode: "timestamp_ms" }).notNull();
export const user = sqliteTable("user", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull(),
  image: text("image"),
  createdAt: time("created_at"),
  updatedAt: time("updated_at"),
});
const userId = () =>
  text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });
export const session = sqliteTable(
  "session",
  {
    id: id(),
    token: text("token").notNull().unique(),
    userId: userId(),
    expiresAt: time("expires_at"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: time("created_at"),
    updatedAt: time("updated_at"),
  },
  (t) => [index("session_owner").on(t.userId)],
);
export const account = sqliteTable(
  "account",
  {
    id: id(),
    userId: userId(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_expires", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_expires", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: time("created_at"),
    updatedAt: time("updated_at"),
  },
  (t) => [
    uniqueIndex("account_external").on(t.providerId, t.accountId),
    index("account_owner").on(t.userId),
  ],
);
export const verification = sqliteTable(
  "verification",
  {
    id: id(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: time("expires_at"),
    createdAt: time("created_at"),
    updatedAt: time("updated_at"),
  },
  (t) => [index("verification_identifier").on(t.identifier)],
);
export const rateLimit = sqliteTable("rate_limit", {
  id: id(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: integer("last_request").notNull(),
});
