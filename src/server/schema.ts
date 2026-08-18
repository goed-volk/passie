import { sqliteTable, text, integer, uniqueIndex, index, primaryKey } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const clubs = sqliteTable("clubs", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  city: text("city").notNull(),
  colorPrimary: text("color_primary").notNull(),
  colorSecondary: text("color_secondary").notNull(),
  colorAccent: text("color_accent").notNull(),
  colorOnPrimary: text("color_on_primary").notNull(),
  logoUrl: text("logo_url"),
  icsHomeFeedUrl: text("ics_home_feed_url").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const seasons = sqliteTable("seasons", {
  id: text("id").primaryKey(),
  clubId: text("club_id").notNull().references(() => clubs.id),
  label: text("label").notNull(),
  startsOn: text("starts_on").notNull(),
  endsOn: text("ends_on").notNull(),
});

export const fixtures = sqliteTable("fixtures", {
  id: text("id").primaryKey(),
  clubId: text("club_id").notNull().references(() => clubs.id),
  seasonId: text("season_id").notNull().references(() => seasons.id),
  source: text("source", { enum: ["ics", "manual"] }).notNull().default("ics"),
  sourceUid: text("source_uid").notNull(),
  sourceSequence: integer("source_sequence").notNull().default(0),
  sourceLastModified: integer("source_last_modified"),
  competition: text("competition").notNull(),
  opponent: text("opponent").notNull(),
  isHome: integer("is_home").notNull().default(1),
  kickoffAt: integer("kickoff_at").notNull(),
  venue: text("venue").notNull(),
  status: text("status", { enum: ["scheduled", "cancelled"] }).notNull().default("scheduled"),
  rawSummary: text("raw_summary").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  uniqueIndex("fixtures_club_source_uid_idx").on(table.clubId, table.source, table.sourceUid),
  index("fixtures_kickoff_at_idx").on(table.kickoffAt),
]);

export const groups = sqliteTable("groups", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  clubId: text("club_id").notNull().references(() => clubs.id),
  timezone: text("timezone").notNull().default("Europe/Amsterdam"),
  createdAt: integer("created_at").notNull(),
});

export const members = sqliteTable("members", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull().references(() => groups.id),
  slug: text("slug").notNull(),
  displayName: text("display_name").notNull(),
  initials: text("initials").notNull(),
  avatarColor: text("avatar_color").notNull(),
  isActive: integer("is_active").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  uniqueIndex("members_group_slug_idx").on(table.groupId, table.slug),
]);

export const passes = sqliteTable("passes", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull().references(() => groups.id),
  label: text("label").notNull(),
  seatInfo: text("seat_info"),
  holderMemberId: text("holder_member_id").references(() => members.id),
  isActive: integer("is_active").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  uniqueIndex("passes_group_label_idx").on(table.groupId, table.label),
]);

export const passOwners = sqliteTable("pass_owners", {
  passId: text("pass_id").notNull().references(() => passes.id),
  memberId: text("member_id").notNull().references(() => members.id),
  shareNote: text("share_note"),
}, (table) => [
  primaryKey({ columns: [table.passId, table.memberId] }),
]);

export const gamePools = sqliteTable("game_pools", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull().references(() => groups.id),
  fixtureId: text("fixture_id").notNull().references(() => fixtures.id),
  status: text("status", { enum: ["open", "closed", "cancelled"] }).notNull().default("open"),
  indicationDeadlineAt: integer("indication_deadline_at").notNull(),
  version: integer("version").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  uniqueIndex("game_pools_group_fixture_idx").on(table.groupId, table.fixtureId),
]);

export const queueEntries = sqliteTable("queue_entries", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  gamePoolId: text("game_pool_id").notNull().references(() => gamePools.id),
  memberId: text("member_id").notNull().references(() => members.id),
  kind: text("kind", { enum: ["self", "guest"] }).notNull(),
  guestName: text("guest_name"),
  status: text("status", { enum: ["waiting", "assigned", "cancelled"] }).notNull().default("waiting"),
  assignedPassId: text("assigned_pass_id").references(() => passes.id),
  assignedAt: integer("assigned_at"),
  cancelledAt: integer("cancelled_at"),
  cancelledByMemberId: text("cancelled_by_member_id").references(() => members.id),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  uniqueIndex("queue_entries_assigned_pass_unique").on(table.assignedPassId).where(sql`status = 'assigned'`),
  index("queue_entries_pool_status_id_idx").on(table.gamePoolId, table.status, table.id),
]);

export const passGameStates = sqliteTable("pass_game_states", {
  id: text("id").primaryKey(),
  gamePoolId: text("game_pool_id").notNull().references(() => gamePools.id),
  passId: text("pass_id").notNull().references(() => passes.id),
  status: text("status", { enum: ["unindicated", "kept", "released", "assigned"] }).notNull().default("unindicated"),
  indicatedByMemberId: text("indicated_by_member_id").references(() => members.id),
  indicatedAt: integer("indicated_at"),
  releasedAt: integer("released_at"),
  claimantEntryId: integer("claimant_entry_id").references(() => queueEntries.id),
  assignedAt: integer("assigned_at"),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  uniqueIndex("pass_game_states_pool_pass_idx").on(table.gamePoolId, table.passId),
  uniqueIndex("pass_game_states_claimant_entry_unique").on(table.claimantEntryId).where(sql`claimant_entry_id IS NOT NULL`),
]);

export const possessionEvents = sqliteTable("possession_events", {
  id: text("id").primaryKey(),
  passId: text("pass_id").notNull().references(() => passes.id),
  fromMemberId: text("from_member_id").references(() => members.id),
  toMemberId: text("to_member_id").notNull().references(() => members.id),
  actorMemberId: text("actor_member_id").notNull().references(() => members.id),
  fixtureId: text("fixture_id").references(() => fixtures.id),
  kind: text("kind", { enum: ["handover", "correction"] }).notNull().default("handover"),
  note: text("note"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("possession_events_pass_created_idx").on(table.passId, table.createdAt),
]);

export const activityEvents = sqliteTable("activity_events", {
  id: text("id").primaryKey(),
  gamePoolId: text("game_pool_id").references(() => gamePools.id),
  passId: text("pass_id").references(() => passes.id),
  actorMemberId: text("actor_member_id").references(() => members.id),
  type: text("type").notNull(),
  payloadJson: text("payload_json").notNull(),
  idempotencyKey: text("idempotency_key"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  uniqueIndex("activity_events_idempotency_idx").on(table.idempotencyKey),
  index("activity_events_pool_created_idx").on(table.gamePoolId, table.createdAt),
]);

export const poolVersionGuards = sqliteTable("pool_version_guards", {
  gamePoolId: text("game_pool_id").notNull().references(() => gamePools.id),
  version: integer("version").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.gamePoolId, table.version] }),
]);
