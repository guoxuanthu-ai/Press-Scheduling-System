CREATE TABLE `app_state` (
	`id` int NOT NULL,
	`revision` bigint NOT NULL,
	`data` json NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `app_state_id` PRIMARY KEY(`id`)
);
