import { env } from 'cloudflare:workers';

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS rooms (
    code TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    host_guest_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS participants (
    room_code TEXT NOT NULL,
    guest_id TEXT NOT NULL,
    nickname TEXT NOT NULL,
    role TEXT DEFAULT 'guest' NOT NULL,
    color TEXT NOT NULL,
    joined_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    PRIMARY KEY (room_code, guest_id),
    FOREIGN KEY (room_code) REFERENCES rooms(code) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS playback (
    room_code TEXT PRIMARY KEY NOT NULL,
    video_id TEXT DEFAULT '' NOT NULL,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    thumbnail TEXT,
    requested_by TEXT NOT NULL,
    duration INTEGER DEFAULT 178 NOT NULL,
    playing INTEGER DEFAULT 0 NOT NULL,
    shuffle INTEGER DEFAULT 0 NOT NULL,
    position REAL DEFAULT 0 NOT NULL,
    position_updated_at INTEGER NOT NULL,
    revision INTEGER DEFAULT 1 NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (room_code) REFERENCES rooms(code) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS queue_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    room_code TEXT NOT NULL,
    video_id TEXT NOT NULL,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    thumbnail TEXT,
    requested_by TEXT NOT NULL,
    requester_guest_id TEXT NOT NULL,
    duration INTEGER DEFAULT 204 NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (room_code) REFERENCES rooms(code) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS api_rate_limits (
    key TEXT PRIMARY KEY NOT NULL,
    window_started_at INTEGER NOT NULL,
    count INTEGER DEFAULT 1 NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_participants_room_seen ON participants(room_code, last_seen)',
  'CREATE INDEX IF NOT EXISTS idx_queue_items_room_id ON queue_items(room_code, id)',
];

let schemaReady: Promise<void> | null = null;

export function getDatabase() {
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database) throw new Error('D1 binding DB is not configured.');
  return database;
}

export async function ensureDatabase(database = getDatabase()) {
  if (!schemaReady) {
    schemaReady = database.batch(schemaStatements.map((statement) => database.prepare(statement)))
      .then(async () => {
        await database.prepare('PRAGMA optimize').run();
      })
      .catch((error) => {
        schemaReady = null;
        throw error;
      });
  }
  await schemaReady;
  return database;
}
