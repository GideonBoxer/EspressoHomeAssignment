# The Trial Issue Log

- [What it does](#what-it-does)
- [Decisions and why](#decisions-and-why)
- [Running it](#running-it)
- [API examples](#api-examples)
- [Project layout](#project-layout)
- [Nice-to-haves](#nice-to-haves)

A small end-to-end app for tracking issues found during a clinical trial site
visit. You can log an issue, edit or resolve it, filter and search the list, and
see a dashboard of counts by status and severity. Built as a take-home for
Espresso (Founding Engineer).

The whole thing is one Node process: an Express server that exposes a JSON API
and also serves the plain HTML/JS frontend. One install, one command, one URL.

## What it does

**Frontend (the UI at `http://localhost:3000`)**

- **Issues page** — a create form (title, description, site, severity); a filter
  bar with a title search box and status/severity dropdowns; a table of issues
  with per-row **Edit**, **Resolve**, and **Delete** actions; and an **Upload
  batch (CSV)** control that bulk-imports issues from a file.
- **Dashboard page** — two rows of count chips (Open / In Progress / Resolved and
  Minor / Major / Critical) plus a small breakdown bar chart, all fed by the
  dashboard endpoint.

**Backend (JSON API under `/api`)**

| Method   | Path               | Purpose                                              |
| -------- | ------------------ | --------------------------------------------------- |
| `GET`    | `/api/issues`      | List issues; supports `search`, `status`, `severity`, `sort` |
| `POST`   | `/api/issues`      | Create an issue                                      |
| `GET`    | `/api/issues/:id`  | Get one issue                                        |
| `PUT`    | `/api/issues/:id`  | Update (partial allowed); "Resolve" sets `status:"resolved"` |
| `DELETE` | `/api/issues/:id`  | Delete an issue                                      |
| `GET`    | `/api/dashboard`   | Counts by status and by severity                    |
| `POST`   | `/api/import`      | Bulk-import issues from a raw `text/csv` body        |

Input is validated on every write (required fields, enum values). Errors come
back as `{ "error": "..." }` with the right HTTP status. CSV import is
all-or-nothing — one bad row fails the whole batch and imports nothing — and it
preserves the `createdAt` from the file so historical sample data keeps its real
dates.

The sample data lives in [issues.csv](issues.csv); you can load it through the
**Upload batch (CSV)** button on the Issues page.

## Decisions and why

The assignment left the stack open but asked me to explain each choice. The
guiding principle throughout was **keep it simple and working end-to-end, don't
over-engineer** — and, since I'm an experienced developer but new to Node, to
favour the boring, readable option I can defend line by line.

- **Backend — Express.** The most ubiquitous and best-documented Node framework,
  with the least "magic". That makes it easy to read and defend under a time box.
  I considered Fastify (nicer built-in validation) and ruled out NestJS as
  over-engineered for this scope.
- **Database — SQLite (via `better-sqlite3`).** An embedded SQL engine: the data
  is a single file on disk, with no separate database server to install or run.
  I still get real SQL for the filtering, search, and sorting the assignment
  needs (`WHERE`, `LIKE`, `ORDER BY createdAt DESC`), plus schema-level
  enforcement of enums, required fields, the auto-increment id, and timestamps.
  CSV stays in the project as an import *format*, not the storage engine.
  *At scale:* a managed relational DB on AWS RDS (Postgres or MySQL) for
  concurrency, durability, and managed backups — an easy migration since all
  three speak SQL.
- **Frontend — plain HTML + vanilla JS, served by Express.** No build step, no
  framework: one `index.html`, one CSS file, one JS file that calls the API with
  `fetch()`. Chosen for maximum simplicity and readability, for one deployable
  unit, and for a clean architecture story — the JSON API is the single source of
  truth, used identically by the UI and by `curl`. The trade-off is manual DOM
  updates, which are fine at this size.
  *At scale:* a component framework (React or Vue) built to static files and
  served from S3 + CloudFront, decoupled from the API.
- **Deployment — not done, by choice.** A live AWS URL was a "nice-to-have" the
  brief said to leave for last. I prioritised a complete, working app and a clear
  deploy story over a live URL, for two reasons: time, and a personal one — AWS
  sign-up requires a credit card, and from previous experience with AWS I know
  their billing model is aggressive, so I'd rather not hand over payment details
  for a throwaway demo. The intended path was a single free-tier EC2 instance
  running this app as a **Docker container** (Node serving both API and frontend,
  SQLite as a file on a mounted volume) — one server, one URL, simple to set up
  and explain, and containerising even the single-instance deploy keeps the build
  reproducible and makes the move to ECS later a no-op. The production path would
  run that same container on ECS behind a load balancer, with RDS for the database
  and S3 + CloudFront for the frontend.

See [db/README.md](db/README.md) for the schema and the data-model reasoning.

## Running it

Requires **Node.js 20+** (developed on 24.17.0). `better-sqlite3` installs from a
prebuilt binary, so no compiler or build tools are needed.

```bash
npm install      # install dependencies
npm start        # start the server on http://localhost:3000
```

Then open **http://localhost:3000** in a browser. The server creates the SQLite
database file on first run, so the list starts empty — use the **Upload batch
(CSV)** button on the Issues page to load [issues.csv](issues.csv), or just
create issues with the form.

To run the tests:

```bash
npm test
```

This runs the Node built-in test runner against the API (issues CRUD, dashboard
counts, and CSV import) using an in-memory database, so it doesn't touch your
real data.

Other useful bits:

- `npm run dev` — same as `start` but auto-reloads on file changes.
- The port is configurable via the `PORT` environment variable (default `3000`),
  and the database path via `DB_PATH` (default `db/issues.db`).

## API examples

Quick `curl` calls against a running server (assumes `http://localhost:3000`):

```bash
# Create an issue
curl -X POST http://localhost:3000/api/issues \
  -H "Content-Type: application/json" \
  -d '{"title":"Missing consent form","description":"Not in file for patient 003","site":"Site-101","severity":"major"}'

# List issues (open + critical, newest first)
curl "http://localhost:3000/api/issues?status=open&severity=critical"

# Get one issue
curl http://localhost:3000/api/issues/1

# Resolve an issue (partial update)
curl -X PUT http://localhost:3000/api/issues/1 \
  -H "Content-Type: application/json" -d '{"status":"resolved"}'

# Delete an issue
curl -X DELETE http://localhost:3000/api/issues/1

# Dashboard counts
curl http://localhost:3000/api/dashboard

# Import the sample CSV
curl -X POST http://localhost:3000/api/import \
  -H "Content-Type: text/csv" --data-binary @issues.csv
```

## Project layout

```
/
├─ server/            # Express app — one job per file
│  ├─ server.js       # entry point: opens the DB, starts listening
│  ├─ app.js          # Express setup: middleware, routes, static frontend
│  ├─ db.js           # SQLite connection + schema init
│  ├─ validation.js   # shared input validation + enum lists
│  └─ routes/         # issues.js, dashboard.js, import.js
├─ frontend/          # static UI served by Express (index.html, app.js, styles.css)
├─ db/                # schema.sql + README (schema description); issues.db (gitignored)
├─ tests/             # issues, dashboard, import — run with `npm test`
├─ issues.csv         # provided sample data
├─ package.json
└─ README.md
```

## Nice-to-haves

The brief listed some optional extras. What I picked up:

- **Done — inline Resolve button.** Each row in the issues table has a one-click
  **Resolve** action that flips its status to `resolved` (a `PUT` with
  `{"status":"resolved"}`), no edit dialog needed.
- **Done — tests.** A small suite over the API (issues CRUD, dashboard counts, CSV
  import) on an in-memory database; see [Running it](#running-it).

Left as gaps, given the time box:

- **Pagination** — the list returns all matching issues; at larger volumes this
  would want server-side paging (`LIMIT`/`OFFSET` plus a total count).
- **Auth** — there is no authentication; a real deployment would need at least a
  login, even a single hardcoded user to start.

