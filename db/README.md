# Database — The Trial Issue Log

The schema deliverable for the assignment. The full DDL lives in
[`schema.sql`](schema.sql); this file explains the model and the choices behind it.

## Engine

**SQLite**, embedded via the `better-sqlite3` npm package. There is no separate
database server to install or run — the engine is compiled into the package, and
the whole database is a single file on disk (`db/issues.db`, gitignored). See the
top-level `README.md` for why SQLite was chosen for the assignment and what the
production path (managed Postgres/MySQL on RDS) looks like.

## Tables

### One table: `issues`

A single table is the right model at this scope. Each row is one issue found
during a site visit. We deliberately did **not** add more tables:

- **No `users` / `auth` table** — auth is, at most, a nice-to-have stub with a
  single hardcoded user, which needs no table.
- **No `sites` table** — `site` is just a label (e.g. `"Site-101"`). There are no
  site attributes to store, so normalizing it would add joins and ceremony with no
  benefit (premature normalization).
- **No lookup tables for `severity` / `status`** — these are small, fixed enums.
  A `CHECK` constraint enforces the allowed values at the database level for free;
  a join table would be pure overhead.
- **No `comments` / `attachments` / `history`** — none are in the brief.

## Columns

| column        | type    | constraints                                              | notes                                   |
| ------------- | ------- | -------------------------------------------------------- | --------------------------------------- |
| `id`          | INTEGER | PRIMARY KEY AUTOINCREMENT                                | server-assigned; never reused           |
| `title`       | TEXT    | NOT NULL                                                 | required, also validated by the API     |
| `description` | TEXT    | NOT NULL                                                 | required, also validated by the API     |
| `site`        | TEXT    | (nullable)                                               | optional label, e.g. `"Site-101"`       |
| `severity`    | TEXT    | NOT NULL, DEFAULT `'minor'`, CHECK in enum               | `minor` \| `major` \| `critical`        |
| `status`      | TEXT    | NOT NULL, DEFAULT `'open'`, CHECK in enum                | `open` \| `in_progress` \| `resolved`   |
| `createdAt`   | TEXT    | NOT NULL                                                 | ISO-8601 string, e.g. `2025-05-01T09:00:00Z` |
| `updatedAt`   | TEXT    | NOT NULL                                                 | ISO-8601 string; bumped on every change |

## Type choices (and why)

SQLite has no dedicated `ENUM`, `BOOLEAN`, or `DATETIME` types, so:

- **Enums → `TEXT` + `CHECK`.** The `CHECK (... IN (...))` constraint rejects any
  value outside the enum at the database level, so bad data can't be stored even
  if the API layer were bypassed. Defaults (`'minor'`, `'open'`) match the API
  contract.
- **Timestamps → ISO-8601 `TEXT`.** ISO-8601 strings sort the same as the dates
  they represent, so `ORDER BY createdAt DESC` returns newest-first with no date
  parsing, and the stored value is already the exact shape the JSON API returns.
- **`id` → `INTEGER PRIMARY KEY AUTOINCREMENT`.** `INTEGER PRIMARY KEY` aliases
  SQLite's rowid (auto-assigned on insert); `AUTOINCREMENT` additionally prevents
  id reuse after deletes, so old references never silently point at a new issue.

## Indexes

None beyond the primary key. At the assignment's data size (a handful to a few
hundred rows) SQLite scans the table faster than index bookkeeping would save. At
production scale the obvious additions would be indexes on `status`, `severity`,
and `createdAt` to back the filters and the default sort.

## How the schema is applied

`schema.sql` is the single source of truth for the table definition. The app's
`server/db.js` reads this file and executes it once at startup. Because the
statement is `CREATE TABLE IF NOT EXISTS`, running it again on an existing
database is a harmless no-op — the app can start repeatedly without wiping data.

## Production / scale notes

When this grows beyond the assignment, the migration story is:

1. **Move to a managed relational DB** (Postgres or MySQL on AWS RDS) for
   concurrency, durability, and managed backups. All three speak SQL, so the table
   shape carries over; `TEXT` enums become native `ENUM`/`CHECK`, and timestamp
   columns become real `timestamptz`.
2. **Promote `site` to its own table** once sites gain attributes (address,
   coordinator, active flag), with `issues.site_id` as a foreign key.
3. **Promote the `severity` / `status` enums to lookup tables.** Today the allowed
   values live in code — a `CHECK` constraint in `schema.sql` plus the matching
   lists in `server/validation.js` — which is the right call at this scope (no extra
   tables or joins for two short, fixed sets). If the enums need to grow into managed
   reference data (adding values without a code change/migration, storing per-value
   attributes like a label, sort order, or colour, or enforcing them across many
   tables), they'd move into their own `severities` / `statuses` tables. The
   `issues.severity` / `issues.status` columns would then become foreign keys to
   those tables' ids instead of free `TEXT` constrained by a `CHECK`.
4. **Add `users` and an audit/`history` table** to record who changed what and
   when, once the app has real accounts.
