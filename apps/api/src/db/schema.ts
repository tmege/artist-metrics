import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  bigint,
  real,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ── Users (mirror of Supabase auth.users) ──

export const users = pgTable("users", {
  id: uuid("id").primaryKey(), // matches auth.users.id
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  artists: many(artists),
}));

// ── Artists ──

export const artists = pgTable("artists", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const artistsRelations = relations(artists, ({ one, many }) => ({
  user: one(users, { fields: [artists.userId], references: [users.id] }),
  socialAccounts: many(socialAccounts),
}));

// ── Social Accounts ──

export const socialAccounts = pgTable(
  "social_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    artistId: uuid("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    platform: text("platform", { enum: ["youtube", "instagram", "tiktok", "spotify", "apple_music", "deezer", "youtube_music"] }).notNull(),
    platformAccountId: text("platform_account_id").notNull(),
    username: text("username"),
    isOAuthConnected: boolean("is_oauth_connected").default(false).notNull(),
    accessToken: text("access_token"), // encrypted
    refreshToken: text("refresh_token"), // encrypted
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("social_accounts_artist_platform_idx").on(
      table.artistId,
      table.platform
    ),
  ]
);

export const socialAccountsRelations = relations(
  socialAccounts,
  ({ one, many }) => ({
    artist: one(artists, {
      fields: [socialAccounts.artistId],
      references: [artists.id],
    }),
    metrics: many(socialMetrics),
  })
);

// ── Social Metrics (time-series, append-only) ──

export const socialMetrics = pgTable(
  "social_metrics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    socialAccountId: uuid("social_account_id")
      .notNull()
      .references(() => socialAccounts.id, { onDelete: "cascade" }),
    followers: bigint("followers", { mode: "number" }),
    views: bigint("views", { mode: "number" }),
    posts: bigint("posts", { mode: "number" }),
    likes: bigint("likes", { mode: "number" }),
    engagementRate: real("engagement_rate"),
    platformData: jsonb("platform_data"), // platform-specific extra data
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("social_metrics_account_fetched_idx").on(
      table.socialAccountId,
      table.fetchedAt
    ),
  ]
);

export const socialMetricsRelations = relations(socialMetrics, ({ one }) => ({
  socialAccount: one(socialAccounts, {
    fields: [socialMetrics.socialAccountId],
    references: [socialAccounts.id],
  }),
}));
