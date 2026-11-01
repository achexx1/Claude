import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_system     INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,             -- sha256 от токена из cookie
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  prefix       TEXT NOT NULL,              -- начало ключа для отображения
  key_hash     TEXT NOT NULL UNIQUE,       -- sha256 от ключа, сам ключ не храним
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at   INTEGER
);

CREATE TABLE IF NOT EXISTS agents (
  id            INTEGER PRIMARY KEY,
  owner_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug          TEXT NOT NULL,
  name          TEXT NOT NULL,
  tagline       TEXT NOT NULL,
  description   TEXT NOT NULL,
  category      TEXT NOT NULL,
  tags          TEXT NOT NULL DEFAULT '',   -- через запятую
  icon          TEXT NOT NULL DEFAULT '🤖',
  endpoint      TEXT NOT NULL,
  secret        TEXT NOT NULL,              -- общий секрет: агент проверяет, что вызов пришёл от Agora
  input_hint    TEXT NOT NULL DEFAULT '',
  example_input TEXT NOT NULL DEFAULT '',
  price_note    TEXT NOT NULL DEFAULT '',
  version       TEXT NOT NULL DEFAULT '1.0',
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  UNIQUE (owner_id, slug)
);

-- Полнотекстовый поиск. На этапе 2+ дополним поиском по смыслу (эмбеддинги).
CREATE VIRTUAL TABLE IF NOT EXISTS agents_fts USING fts5(
  name, tagline, description, tags,
  content='agents', content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);
CREATE TRIGGER IF NOT EXISTS agents_ai AFTER INSERT ON agents BEGIN
  INSERT INTO agents_fts(rowid, name, tagline, description, tags)
  VALUES (new.id, new.name, new.tagline, new.description, new.tags);
END;
CREATE TRIGGER IF NOT EXISTS agents_ad AFTER DELETE ON agents BEGIN
  INSERT INTO agents_fts(agents_fts, rowid, name, tagline, description, tags)
  VALUES ('delete', old.id, old.name, old.tagline, old.description, old.tags);
END;
CREATE TRIGGER IF NOT EXISTS agents_au AFTER UPDATE ON agents BEGIN
  INSERT INTO agents_fts(agents_fts, rowid, name, tagline, description, tags)
  VALUES ('delete', old.id, old.name, old.tagline, old.description, old.tags);
  INSERT INTO agents_fts(rowid, name, tagline, description, tags)
  VALUES (new.id, new.name, new.tagline, new.description, new.tags);
END;

-- Каждая задача, прошедшая через шлюз. Содержимое задач (вход и выход) НЕ храним:
-- только метаданные, из которых считается паспорт доверия.
CREATE TABLE IF NOT EXISTS tasks (
  id         TEXT PRIMARY KEY,
  agent_id   INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  buyer_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  buyer_type TEXT NOT NULL CHECK (buyer_type IN ('human', 'agent')),
  channel    TEXT NOT NULL CHECK (channel IN ('web', 'api')),
  status     TEXT NOT NULL CHECK (status IN ('ok', 'agent_error', 'timeout', 'unreachable')),
  latency_ms INTEGER,
  error      TEXT,
  self_test  INTEGER NOT NULL DEFAULT 0,      -- владелец проверяет своего агента: в паспорт не идёт
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tasks_agent_time ON tasks(agent_id, created_at);
CREATE INDEX IF NOT EXISTS tasks_buyer_time ON tasks(buyer_id, created_at);
`;

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/** Миграции для баз, созданных более ранними версиями. Каждая проверяет, нужна ли она. */
function migrate(db) {
  const hasColumn = (table, col) => db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
  if (!hasColumn('tasks', 'self_test')) {
    db.exec('ALTER TABLE tasks ADD COLUMN self_test INTEGER NOT NULL DEFAULT 0');
  }
}

/** Выполнить функцию в транзакции. */
export function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
