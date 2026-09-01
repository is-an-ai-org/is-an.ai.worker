CREATE TABLE `subdomains` (
	`id` text PRIMARY KEY NOT NULL,
	`subdomain_name` text NOT NULL,
	`description` text NOT NULL,
	`record` text NOT NULL,
	`owner_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subdomains_subdomain_name_unique` ON `subdomains` (`subdomain_name`);