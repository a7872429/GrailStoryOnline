// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import {integer,sqliteTable,text} from "drizzle-orm/sqlite-core";
export const rooms=sqliteTable("rooms",{code:text("code").primaryKey(),hostName:text("host_name").notNull(),guestName:text("guest_name"),hostToken:text("host_token").notNull(),guestToken:text("guest_token"),revision:integer("revision").notNull().default(0),gameState:text("game_state"),activeSeat:integer("active_seat").notNull().default(0),turnStartedAt:integer("turn_started_at"),lastActionAt:integer("last_action_at"),hostInfractions:integer("host_infractions").notNull().default(0),guestInfractions:integer("guest_infractions").notNull().default(0),reminderSent:integer("reminder_sent").notNull().default(0),autoActionSent:integer("auto_action_sent").notNull().default(0),loserSeat:integer("loser_seat"),updatedAt:integer("updated_at").notNull()});
