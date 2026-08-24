import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const rooms = sqliteTable('rooms', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  hostGuestId: text('host_guest_id').notNull(),
  visibility: text('visibility', { enum: ['private', 'public'] }).notNull().default('private'),
  maxParticipants: integer('max_participants').notNull().default(50),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [
  index('idx_rooms_visibility_updated').on(table.visibility, table.updatedAt),
]);

export const participants = sqliteTable('participants', {
  roomCode: text('room_code').notNull().references(() => rooms.code, { onDelete: 'cascade' }),
  guestId: text('guest_id').notNull(),
  nickname: text('nickname').notNull(),
  role: text('role', { enum: ['host', 'guest'] }).notNull().default('guest'),
  color: text('color').notNull(),
  joinedAt: integer('joined_at').notNull(),
  lastSeen: integer('last_seen').notNull(),
}, (table) => [
  primaryKey({ columns: [table.roomCode, table.guestId] }),
  index('idx_participants_room_seen').on(table.roomCode, table.lastSeen),
]);

export const queueItems = sqliteTable('queue_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  roomCode: text('room_code').notNull().references(() => rooms.code, { onDelete: 'cascade' }),
  videoId: text('video_id').notNull(),
  title: text('title').notNull(),
  artist: text('artist').notNull(),
  thumbnail: text('thumbnail'),
  requestedBy: text('requested_by').notNull(),
  requesterGuestId: text('requester_guest_id').notNull(),
  duration: integer('duration').notNull().default(204),
  createdAt: integer('created_at').notNull(),
}, (table) => [
  index('idx_queue_items_room_id').on(table.roomCode, table.id),
]);

export const playback = sqliteTable('playback', {
  roomCode: text('room_code').primaryKey().references(() => rooms.code, { onDelete: 'cascade' }),
  videoId: text('video_id').notNull().default(''),
  title: text('title').notNull(),
  artist: text('artist').notNull(),
  thumbnail: text('thumbnail'),
  requestedBy: text('requested_by').notNull(),
  duration: integer('duration').notNull().default(178),
  playing: integer('playing', { mode: 'boolean' }).notNull().default(false),
  shuffle: integer('shuffle', { mode: 'boolean' }).notNull().default(false),
  position: real('position').notNull().default(0),
  positionUpdatedAt: integer('position_updated_at').notNull(),
  revision: integer('revision').notNull().default(1),
  updatedAt: integer('updated_at').notNull(),
});

export const apiRateLimits = sqliteTable('api_rate_limits', {
  key: text('key').primaryKey(),
  windowStartedAt: integer('window_started_at').notNull(),
  count: integer('count').notNull().default(1),
  updatedAt: integer('updated_at').notNull(),
});
