-- schema.sql — The Trial Issue Log
--
-- One table: `issues`. Each row is a single issue found during a clinical
-- trial site visit. A single table is the right model at this scope; see
-- db/README.md for the reasoning and what we'd split out at production scale.
--
-- Engine: SQLite (via better-sqlite3). SQLite has no dedicated ENUM or DATETIME
-- types, so we use TEXT columns and lean on CHECK constraints to enforce the
-- enums, and store timestamps as ISO-8601 strings (which sort correctly as text,
-- so "ORDER BY createdAt DESC" gives newest-first without any date parsing).

CREATE TABLE IF NOT EXISTS issues (
  -- Surrogate primary key. "INTEGER PRIMARY KEY" makes this column an alias for
  -- SQLite's internal rowid, so it auto-assigns the next number on insert.
  -- AUTOINCREMENT additionally guarantees ids are never reused after a delete --
  -- desirable for an issue tracker, where a stale link to issue #7 should never
  -- silently point at a different issue later.
  id          INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Required free-text fields. NOT NULL is the database backstop; the API layer
  -- also validates that these are present and non-empty before inserting.
  title       TEXT NOT NULL,
  description TEXT NOT NULL,

  -- Optional location label, e.g. "Site-101". Nullable on purpose.
  site        TEXT,

  -- Enums enforced at the DB level via CHECK, with the contract's defaults.
  -- An invalid value (e.g. severity = 'huge') is rejected by the database itself.
  severity    TEXT NOT NULL DEFAULT 'minor'
                CHECK (severity IN ('minor', 'major', 'critical')),
  status      TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'in_progress', 'resolved')),

  -- ISO-8601 timestamps stored as text, e.g. "2025-05-01T09:00:00Z".
  -- The server sets both on create and bumps updatedAt on every change; on CSV
  -- import, createdAt is taken from the file.
  createdAt   TEXT NOT NULL,
  updatedAt   TEXT NOT NULL
);
