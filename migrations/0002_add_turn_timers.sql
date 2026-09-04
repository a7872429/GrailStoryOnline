ALTER TABLE `rooms` ADD `active_seat` integer DEFAULT 0 NOT NULL;
ALTER TABLE `rooms` ADD `turn_started_at` integer;
ALTER TABLE `rooms` ADD `last_action_at` integer;
ALTER TABLE `rooms` ADD `host_infractions` integer DEFAULT 0 NOT NULL;
ALTER TABLE `rooms` ADD `guest_infractions` integer DEFAULT 0 NOT NULL;
ALTER TABLE `rooms` ADD `reminder_sent` integer DEFAULT 0 NOT NULL;
ALTER TABLE `rooms` ADD `auto_action_sent` integer DEFAULT 0 NOT NULL;
ALTER TABLE `rooms` ADD `loser_seat` integer;
