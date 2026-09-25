import 'server-only';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { env } from './env';

let db: Database.Database | undefined;

/** The process-wide connection. WAL mode, foreign keys on, 5 s busy timeout. */
export function getDb(): Database.Database {
  if (db) return db;
  const path = env().DATABASE_PATH;
  mkdirSync(dirname(path), { recursive: true });
  db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}

/** Applies db/migrations/*.sql in filename order, each once, recorded in schema_migrations. */
export function runMigrations(
  conn: Database.Database = getDb(),
  dir = join(process.cwd(), 'db', 'migrations'),
): string[] {
  conn.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)',
  );
  const applied = new Set(
    conn.prepare('SELECT name FROM schema_migrations').pluck().all() as string[],
  );
  const record = conn.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)');
  const ran: string[] = [];
  for (const name of readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    if (applied.has(name)) continue;
    const sql = readFileSync(join(dir, name), 'utf8');
    conn.transaction(() => {
      conn.exec(sql);
      record.run(name, new Date().toISOString());
    })();
    ran.push(name);
  }
  return ran;
}
