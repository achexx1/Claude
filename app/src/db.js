import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Миграция 1: схема этапа 1. Не меняйте её: новые изменения добавляйте следующими миграциями.
const SCHEMA_V1 = `
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

// Миграция 2: языки, регион и переводы карточки; отзывы; экзамены Agora.
const SCHEMA_V2 = `
ALTER TABLE agents ADD COLUMN primary_lang TEXT NOT NULL DEFAULT 'ru';   -- язык описания карточки
ALTER TABLE agents ADD COLUMN languages    TEXT NOT NULL DEFAULT 'ru';   -- на каких языках отвечает: 'ru,en'
ALTER TABLE agents ADD COLUMN region       TEXT NOT NULL DEFAULT 'global';
ALTER TABLE agents ADD COLUMN i18n         TEXT NOT NULL DEFAULT '{}';   -- переводы карточки: {"en": {"name": ...}}
ALTER TABLE agents ADD COLUMN i18n_text    TEXT NOT NULL DEFAULT '';     -- переводы одной строкой, для поиска

-- Поиск теперь учитывает и переводы карточки
DROP TRIGGER IF EXISTS agents_ai;
DROP TRIGGER IF EXISTS agents_ad;
DROP TRIGGER IF EXISTS agents_au;
DROP TABLE IF EXISTS agents_fts;
CREATE VIRTUAL TABLE agents_fts USING fts5(
  name, tagline, description, tags, i18n_text,
  content='agents', content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);
CREATE TRIGGER agents_ai AFTER INSERT ON agents BEGIN
  INSERT INTO agents_fts(rowid, name, tagline, description, tags, i18n_text)
  VALUES (new.id, new.name, new.tagline, new.description, new.tags, new.i18n_text);
END;
CREATE TRIGGER agents_ad AFTER DELETE ON agents BEGIN
  INSERT INTO agents_fts(agents_fts, rowid, name, tagline, description, tags, i18n_text)
  VALUES ('delete', old.id, old.name, old.tagline, old.description, old.tags, old.i18n_text);
END;
CREATE TRIGGER agents_au AFTER UPDATE ON agents BEGIN
  INSERT INTO agents_fts(agents_fts, rowid, name, tagline, description, tags, i18n_text)
  VALUES ('delete', old.id, old.name, old.tagline, old.description, old.tags, old.i18n_text);
  INSERT INTO agents_fts(rowid, name, tagline, description, tags, i18n_text)
  VALUES (new.id, new.name, new.tagline, new.description, new.tags, new.i18n_text);
END;
INSERT INTO agents_fts(agents_fts) VALUES ('rebuild');

-- Отзывы: один на автора и канал (человек через сайт / агент через API). Только после реальной задачи.
CREATE TABLE reviews (
  id          INTEGER PRIMARY KEY,
  agent_id    INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  author_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_type TEXT NOT NULL CHECK (author_type IN ('human', 'agent')),
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text        TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  UNIQUE (agent_id, author_id, author_type)
);
CREATE INDEX reviews_agent ON reviews(agent_id, updated_at);

-- Экзамены Agora. Учитывается последний завершённый, если эндпоинт и версия не менялись и ему меньше 30 дней.
CREATE TABLE exams (
  id            INTEGER PRIMARY KEY,
  agent_id      INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN ('running', 'done', 'failed')),
  endpoint      TEXT NOT NULL,
  version       TEXT NOT NULL,
  quality_score REAL,
  safety_score  REAL,
  results       TEXT NOT NULL DEFAULT '[]',
  started_at    INTEGER NOT NULL,
  finished_at   INTEGER
);
CREATE INDEX exams_agent ON exams(agent_id, started_at);
`;

// Миграция 3: оценка качества ответов по существу (модель-судья).
const SCHEMA_V3 = `
ALTER TABLE exams ADD COLUMN substance_score REAL;          -- NULL: проверка по существу не проводилась
ALTER TABLE exams ADD COLUMN substance_status TEXT NOT NULL DEFAULT 'off';  -- off | done | error
ALTER TABLE exams ADD COLUMN judge_model TEXT;
`;

export const MIGRATIONS = [SCHEMA_V1, SCHEMA_V2, SCHEMA_V3];

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  migrate(db);
  // Экзамены, прерванные перезапуском сервера, помечаем как неудавшиеся
  db.prepare(`UPDATE exams SET status = 'failed', finished_at = ? WHERE status = 'running'`).run(Date.now());
  return db;
}

export const schemaVersion = (db) => db.prepare('PRAGMA user_version').get().user_version;

function migrate(db) {
  let version = schemaVersion(db);
  if (version === 0 && db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'`).get()) {
    // База этапа 1 без номера версии. В самых ранних не было колонки self_test.
    const hasSelfTest = db.prepare('PRAGMA table_info(tasks)').all().some((c) => c.name === 'self_test');
    if (!hasSelfTest) db.exec('ALTER TABLE tasks ADD COLUMN self_test INTEGER NOT NULL DEFAULT 0');
    db.exec('PRAGMA user_version = 1');
    version = 1;
  }
  for (let v = version; v < MIGRATIONS.length; v++) {
    tx(db, () => {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
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
