CREATE INDEX IF NOT EXISTS `fixtures_kickoff_at_idx` ON `fixtures` (`kickoff_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `queue_entries_pool_status_id_idx` ON `queue_entries` (`game_pool_id`, `status`, `id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `activity_events_pool_created_idx` ON `activity_events` (`game_pool_id`, `created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `possession_events_pass_created_idx` ON `possession_events` (`pass_id`, `created_at`);
