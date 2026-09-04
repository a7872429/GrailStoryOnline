CREATE TABLE `rooms` (
  `code` text PRIMARY KEY NOT NULL,
  `host_name` text NOT NULL,
  `guest_name` text,
  `host_token` text NOT NULL,
  `guest_token` text,
  `revision` integer DEFAULT 0 NOT NULL,
  `game_state` text,
  `updated_at` integer NOT NULL
);
