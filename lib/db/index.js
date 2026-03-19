import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
// Note: Drizzle's migrate() uses .run() which rejects multi-statement SQL in better-sqlite3 v11+.
// We use a custom migration runner with .exec() instead.
import { clawforgeDb, dataDir, PROJECT_ROOT } from '../paths.js';
import * as schema from './schema.js';

let _db = null;

/**
 * Get or create the Drizzle database instance (lazy singleton).
 * @returns {import('drizzle-orm/better-sqlite3').BetterSQLite3Database}
 */
export function getDb() {
  if (!_db) {
    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const sqlite = new Database(clawforgeDb);
    sqlite.pragma('journal_mode = WAL');
    _db = drizzle(sqlite, { schema });
  }
  return _db;
}

/**
 * Initialize the database — apply pending migrations.
 * Called from instrumentation.js at server startup.
 * Uses Drizzle Kit migrations from the package's drizzle/ folder.
 */
export function initDatabase() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const sqlite = new Database(clawforgeDb);
  sqlite.pragma('journal_mode = WAL');
  const db = drizzle(sqlite, { schema });

  // Resolve migrations folder from the installed package.
  // import.meta.url doesn't survive webpack bundling, so resolve from PROJECT_ROOT.
  // Try local drizzle/ first, fallback to node_modules path
  let migrationsFolder = path.join(PROJECT_ROOT, 'drizzle');
  if (!fs.existsSync(migrationsFolder)) {
    migrationsFolder = path.join(PROJECT_ROOT, 'node_modules', 'clawforge', 'drizzle');
  }

  // Custom migration runner: reads migration journal, applies pending SQL with .exec()
  // (Drizzle's migrate() uses .run() which rejects multi-statement SQL in better-sqlite3 v11+)
  const journalPath = path.join(migrationsFolder, 'meta', '_journal.json');
  if (fs.existsSync(journalPath)) {
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));

    // Create migrations tracking table if it doesn't exist
    sqlite.exec(`CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL,
      created_at INTEGER
    )`);

    const applied = new Set(
      sqlite.prepare('SELECT hash FROM __drizzle_migrations').all().map(r => r.hash)
    );

    for (const entry of journal.entries) {
      if (!applied.has(entry.tag)) {
        const sqlFile = path.join(migrationsFolder, `${entry.tag}.sql`);
        if (fs.existsSync(sqlFile)) {
          const sql = fs.readFileSync(sqlFile, 'utf8');
          // Split on Drizzle's statement-breakpoint markers or semicolons to run each
          // statement individually — if one fails with "already exists", others still apply
          const statements = sql.split(/-->\s*statement-breakpoint\s*/)
            .flatMap(block => block.split(/;\s*$/m))
            .map(s => s.trim())
            .filter(s => s.length > 0);
          for (const stmt of statements) {
            try {
              sqlite.exec(stmt);
            } catch (err) {
              if (!err.message.includes('already exists') && !err.message.includes('duplicate column')) {
                throw err;
              }
            }
          }
          sqlite.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)').run(
            entry.tag,
            Date.now()
          );
        }
      }
    }
  }

  sqlite.close();

  // Force re-creation of drizzle instance on next getDb() call
  _db = null;
}
