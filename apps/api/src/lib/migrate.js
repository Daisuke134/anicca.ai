import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.resolve(__dirname, '../../docs/migrations');

export async function runMigrationsOnce() {
  // 進捗管理テーブル
  await query(`create table if not exists schema_migrations(
    id text primary key,
    applied_at timestamptz not null default timezone('utc', now())
  )`);

  const files = (await fs.readdir(MIGRATIONS_DIR))
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const f of files) {
    const id = f;
    const done = await query('select 1 from schema_migrations where id=$1', [id]);
    if (done.rowCount) continue;
    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, f), 'utf8');
    await query(sql);
    await query('insert into schema_migrations(id) values($1)', [id]);
  }
}

