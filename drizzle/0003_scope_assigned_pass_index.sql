DROP INDEX IF EXISTS `queue_entries_assigned_pass_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `queue_entries_pool_assigned_pass_unique` ON `queue_entries` (`game_pool_id`, `assigned_pass_id`) WHERE status = 'assigned';
