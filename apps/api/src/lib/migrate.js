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

  // 006以降のRailway用DDLを適用。既存の他SQLは対象外。
  // v0.3: 010/011 を追加（v0.3新規テーブル + JSONB GINインデックス）
  // Phase-7: 012 を追加（sensor_access_state テーブル）
  const files = (await fs.readdir(MIGRATIONS_DIR))
    .filter(f => /^(006|007|008|010|011|012)_.*\.sql$/.test(f))
    .sort();

  for (const f of files) {
    const id = f;
    const done = await query('select 1 from schema_migrations where id=$1', [id]);
    if (done.rowCount) continue;
    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, f), 'utf8');
    // 単純セミコロン分割で逐次実行（関数等は含まれない前提）
    const statements = sql
      .split(/;\s*\n/gm)
      .map(s => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      await query(stmt);
    }
    await query('insert into schema_migrations(id) values($1)', [id]);
  }
}

