CREATE TABLE `activity_events` (
	`id` text PRIMARY KEY NOT NULL,
	`game_pool_id` text,
	`pass_id` text,
	`actor_member_id` text,
	`type` text NOT NULL,
	`payload_json` text NOT NULL,
	`idempotency_key` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`game_pool_id`) REFERENCES `game_pools`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pass_id`) REFERENCES `passes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_events_idempotency_idx` ON `activity_events` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `clubs` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`short_name` text NOT NULL,
	`city` text NOT NULL,
	`color_primary` text NOT NULL,
	`color_secondary` text NOT NULL,
	`color_accent` text NOT NULL,
	`color_on_primary` text NOT NULL,
	`logo_url` text,
	`ics_home_feed_url` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clubs_slug_unique` ON `clubs` (`slug`);--> statement-breakpoint
CREATE TABLE `fixtures` (
	`id` text PRIMARY KEY NOT NULL,
	`club_id` text NOT NULL,
	`season_id` text NOT NULL,
	`source` text DEFAULT 'ics' NOT NULL,
	`source_uid` text NOT NULL,
	`source_sequence` integer DEFAULT 0 NOT NULL,
	`source_last_modified` integer,
	`competition` text NOT NULL,
	`opponent` text NOT NULL,
	`is_home` integer DEFAULT 1 NOT NULL,
	`kickoff_at` integer NOT NULL,
	`venue` text NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`raw_summary` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`club_id`) REFERENCES `clubs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fixtures_club_source_uid_idx` ON `fixtures` (`club_id`,`source`,`source_uid`);--> statement-breakpoint
CREATE TABLE `game_pools` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`fixture_id` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`indication_deadline_at` integer NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fixture_id`) REFERENCES `fixtures`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_pools_group_fixture_idx` ON `game_pools` (`group_id`,`fixture_id`);--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`club_id` text NOT NULL,
	`timezone` text DEFAULT 'Europe/Amsterdam' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`club_id`) REFERENCES `clubs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `groups_slug_unique` ON `groups` (`slug`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`slug` text NOT NULL,
	`display_name` text NOT NULL,
	`initials` text NOT NULL,
	`avatar_color` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_group_slug_idx` ON `members` (`group_id`,`slug`);--> statement-breakpoint
CREATE TABLE `pass_game_states` (
	`id` text PRIMARY KEY NOT NULL,
	`game_pool_id` text NOT NULL,
	`pass_id` text NOT NULL,
	`status` text DEFAULT 'unindicated' NOT NULL,
	`indicated_by_member_id` text,
	`indicated_at` integer,
	`released_at` integer,
	`claimant_entry_id` integer,
	`assigned_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`game_pool_id`) REFERENCES `game_pools`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pass_id`) REFERENCES `passes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`indicated_by_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`claimant_entry_id`) REFERENCES `queue_entries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pass_game_states_pool_pass_idx` ON `pass_game_states` (`game_pool_id`,`pass_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `pass_game_states_claimant_entry_unique` ON `pass_game_states` (`claimant_entry_id`) WHERE claimant_entry_id IS NOT NULL;--> statement-breakpoint
CREATE TABLE `pass_owners` (
	`pass_id` text NOT NULL,
	`member_id` text NOT NULL,
	`share_note` text,
	PRIMARY KEY(`pass_id`, `member_id`),
	FOREIGN KEY (`pass_id`) REFERENCES `passes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `passes` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`label` text NOT NULL,
	`seat_info` text,
	`holder_member_id` text,
	`is_active` integer DEFAULT 1 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`holder_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `passes_group_label_idx` ON `passes` (`group_id`,`label`);--> statement-breakpoint
CREATE TABLE `possession_events` (
	`id` text PRIMARY KEY NOT NULL,
	`pass_id` text NOT NULL,
	`from_member_id` text,
	`to_member_id` text NOT NULL,
	`actor_member_id` text NOT NULL,
	`fixture_id` text,
	`kind` text DEFAULT 'handover' NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`pass_id`) REFERENCES `passes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fixture_id`) REFERENCES `fixtures`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `queue_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_pool_id` text NOT NULL,
	`member_id` text NOT NULL,
	`kind` text NOT NULL,
	`guest_name` text,
	`status` text DEFAULT 'waiting' NOT NULL,
	`assigned_pass_id` text,
	`assigned_at` integer,
	`cancelled_at` integer,
	`cancelled_by_member_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`game_pool_id`) REFERENCES `game_pools`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_pass_id`) REFERENCES `passes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cancelled_by_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `queue_entries_assigned_pass_unique` ON `queue_entries` (`assigned_pass_id`) WHERE status = 'assigned';--> statement-breakpoint
CREATE TABLE `seasons` (
	`id` text PRIMARY KEY NOT NULL,
	`club_id` text NOT NULL,
	`label` text NOT NULL,
	`starts_on` text NOT NULL,
	`ends_on` text NOT NULL,
	FOREIGN KEY (`club_id`) REFERENCES `clubs`(`id`) ON UPDATE no action ON DELETE no action
);
