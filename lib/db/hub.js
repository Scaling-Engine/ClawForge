import fs from 'fs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { hubDb, dataDir } from '../paths.js';
import * as hubSchema from './hub-schema.js';

let _hubDb = null;

/**
 * Get or create the hub Drizzle database instance (lazy singleton).
 * Connects to data/hub.sqlite — separate from instance clawforge.sqlite.
 * @returns {import('drizzle-orm/better-sqlite3').BetterSQLite3Database}
 */
export function getHubDb() {
  if (!_hubDb) {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const sqlite = new Database(hubDb);
    sqlite.pragma('journal_mode = WAL');
    _hubDb = drizzle(sqlite, { schema: hubSchema });
  }
  return _hubDb;
}

/**
 * Initialize the hub database — creates hub_users and agent_assignments tables.
 * Uses CREATE TABLE IF NOT EXISTS (not migration journal) because hub.sqlite is
 * brand new with no legacy migrations to replay — simpler and idempotent.
 * Called from config/instrumentation.js at server startup when SUPERADMIN_HUB=true.
 */
export function initHubDatabase() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const sqlite = new Database(hubDb);
  sqlite.pragma('journal_mode = WAL');

  sqlite.exec(`CREATE TABLE IF NOT EXISTS hub_users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);

  sqlite.exec(`CREATE TABLE IF NOT EXISTS agent_assignments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES hub_users(id),
    agent_slug TEXT NOT NULL,
    agent_role TEXT NOT NULL DEFAULT 'operator',
    created_at INTEGER NOT NULL
  )`);

  sqlite.close();
  _hubDb = null; // Force re-creation on next getHubDb() call
}
