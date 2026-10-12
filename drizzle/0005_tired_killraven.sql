DROP INDEX `members_group_user_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `members_user_group_idx` ON `members` (`user_id`,`group_id`) WHERE user_id IS NOT NULL;