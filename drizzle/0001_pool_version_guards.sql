CREATE TABLE `pool_version_guards` (
	`game_pool_id` text NOT NULL,
	`version` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`game_pool_id`, `version`),
	FOREIGN KEY (`game_pool_id`) REFERENCES `game_pools`(`id`) ON UPDATE no action ON DELETE no action
);
