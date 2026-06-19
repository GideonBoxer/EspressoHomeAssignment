# CLAUDE.md — The Trial Issue Log

Context and shared understanding for this project. Source of truth for the assignment
is `assignment/Espresso home assignment Founding Engineer (1).pdf`.

## What this is

A take-home assignment from **Espresso** (Founding Engineer role). Build an end-to-end
system to **track issues discovered during a clinical trial site visit**.

Time box: **3–5 hours** (not counting learning time). Partial is acceptable — ship
whatever is working end-to-end and be ready to explain what was/wasn't done.

Guiding principle from the brief: **keep it simple, working end-to-end at each point
(database + backend API + frontend UI). Don't over-engineer.**

## Author context & code-style rules (IMPORTANT)

The author of this submission (the person who will defend it in the interview) is an
**experienced developer who is new to Node.js**. This drives how we write everything:

- **Readability over cleverness.** No fancy idioms or terse one-liners. Favor the most
  boring, obvious way to do something.
- **Good, clear documentation.** Comment the *why*, not just the *what*, so the code is
  easy to follow and explain.
- **Small files, one clear job each.** Easy to read top-to-bottom and explain.
- This is part of why the stack leans toward **Express** (the most ubiquitous,
  best-documented, least "magic" Node framework) — chosen partly *for learnability*.
- The author must be able to **read and defend every line**.

## What the app must let a user do

- Create / edit / resolve issues
- See a list with basic filters
- View a simple dashboard (counts by status & severity)

## Data model — `Issue`

| field         | type                                          | notes              |
| ------------- | --------------------------------------------- | ------------------ |
| `id`          | auto                                          | primary key        |
| `title`       | string                                        | **required**       |
| `description` | text                                          | **required**       |
| `site`        | string                                        | e.g. "Site-101"    |
| `severity`    | enum: `minor` \| `major` \| `critical`        |                    |
| `status`      | enum: `open` \| `in_progress` \| `resolved`   |                    |
| `createdAt`   | datetime                                       |                    |
| `updatedAt`   | datetime                                       |                    |

## Core features (what to build)

1. **CRUD for Issues** — create, read (list + detail), update, delete.
2. **List & Filters**
   - Text search on `title`
   - Filter by `status` and `severity`
   - Sort by `createdAt` (desc)
3. **Dashboard** — simple counts:
   - By status (open / in_progress / resolved)
   - By severity (minor / major / critical)
4. **Import Data** — "Import CSV" button OR a one-time script/endpoint to ingest the
   provided CSV. On success, issues show in the list.
5. **Basic UX** — clean page with: create issue form, issues table with filters,
   dashboard summary chips/cards.

## API

- As we see fit. **Use JSON.**
- **Validate inputs; return 400s on bad data.**

## Suggested frontend (from brief)

- **Issues page:** create form (title, description, site, severity) on top; filters
  (search box + dropdowns for status & severity); table with columns title, site,
  severity, status, createdAt and per-row actions **Edit / Resolve / Delete**; an
  **Upload batch (CSV)** control.
- **Dashboard page:** two rows of chips/graphs — Open/In Progress/Resolved and
  Minor/Major/Critical.
- Navigation between pages; other pages as we see fit.

## Tech constraints (must)

- **Language/Runtime:** Node.js (LTS)
- **Framework:** any Node framework — **must explain the choice**
- **Database:** our choice — **must explain** (for the assignment AND for production/scale)
- **Frontend:** our choice — **must explain** (for the assignment AND for production/scale)
- **Deploy:** AWS free tier (a working AWS URL is a "+", best-case, leave to the end)

## Sample CSV (`issues.csv` — must live in the repo)

Header: `title,description,site,severity,status,createdAt`

Provided rows:
1. Missing consent form — Consent form not in file for patient 003 — Site-101 — major — open — 2025-05-01T09:00:00Z
2. Late visit — Visit week 4 occurred on week 6 — Site-202 — minor — in_progress — 2025-05-03T12:30:00Z
3. Drug temp excursion — IP stored above max temp for 6 hours — Site-101 — critical — open — 2025-05-10T08:15:00Z
4. Unblinded email — Coordinator emailed treatment arm to CRA — Site-303 — major — resolved — 2025-05-14T16:00:00Z

## Deployment & architecture

Should be deployable to AWS free tier. Explain (and ideally demonstrate) how we'd push
to the cloud, the process, why it's the best approach, and the best practices followed.

### Strategy: build first, AWS deploy is LAST and may be skipped

- The brief says a live AWS URL is a **"+"**, best-case, "leave it to the end." The
  mandatory deliverables are the working app + repo + a README that *describes* the
  deploy process and trade-offs. A strong submission is possible **without** a live URL.
- **Author's decision:** leave the actual AWS deploy to the very end; **it may not
  happen at all.** Either way, build the full app and write the deploy guide in the
  README **regardless**, so the deployment thinking is demonstrated.

### Planned approach (most explainable)

- **Assignment: one small EC2 instance runs everything** — the Node server serves both
  the API and the static frontend; the database is a file on the instance disk. One
  server, one URL, easy to whiteboard and defend.
- **Production path:** containerize the app and run it on **ECS (Docker container)**
  behind a load balancer, with the DB on **RDS (Postgres or MySQL)** and the static
  frontend on **S3 + CloudFront** — shows where it scales without over-building now.

### AWS account / cost notes (verified June 2026)

- A **credit or debit card is required at sign-up** for identity verification (small
  temporary ~$1 auth hold, not a charge). There is no official no-card path.
- New accounts can pick the **Free Plan**: **$100 in credits** (up to $200 via
  activities), and it **auto-expires after 6 months or when credits run out** and
  **won't bill the card** — much safer than the old overage model.
- `t2.micro` / `t3.micro` are free-tier eligible (750 hrs/month for 12 months ≈ one
  instance 24/7). Stay on one micro instance.
- Cleanup plan: after the interview, **terminate the EC2 instance and close the
  account**; optionally set a **$1 billing alert** as a safety net.
- The author is wary of the credit-card requirement, so option 1 (skip live deploy,
  ship a great deploy guide) remains fully acceptable.

## Deliverables (GitHub repo)

- `README.md` — setup, run, deploy, endpoint examples, trade-offs
- `server/` (or root) — Node app code
- `frontend/` (if applicable) or templates
- `db/` — schema / tables / description
- `issues.csv`
- Working AWS URL (if we managed to deploy)
- Input validation + minimal error handling

## What they'll evaluate

1. Architecture & ability to explain what we have
2. Code quality & structure (readability, modularity, naming)
3. Simplicity under a time box (good choices, not over-engineering)
4. Working demo (end-to-end correctness)
5. API & data modeling (clean schema, validations)
6. Deployment hygiene

## Nice-to-have (only if time remains)

- Inline "Resolve" button that flips status → resolved
- Pagination (server-side or client-side)
- Minimal tests (1–2 unit tests on validation or a route)
- Lightweight auth stub (single hardcoded user)

## Decisions log

_To be filled in as we choose the stack. Each "must explain" choice should be recorded
here with the reasoning, so it can go into the README and be defended in the interview._

- **Backend framework:** **Express** — most ubiquitous and best-documented Node
  framework, least "magic", easy to read and defend under a time box. Considered
  Fastify (nice built-in validation) as the modern alternative; ruled out NestJS as
  over-engineered for this scope. Validation handled by a small library (see DB/
  validation decisions).
- **Database (assignment):** **SQLite via `better-sqlite3`** — embedded SQL engine,
  data lives in one file on disk; **no separate DB server to install** (just an npm
  package). Real SQL does the filtering/search/sort the assignment needs
  (`WHERE status = ?`, `LIKE`, `ORDER BY createdAt DESC`) and enforces types,
  enums, required fields, auto-increment `id`, and timestamps at the schema level.
  CSV stays in the project as an import *format*, not the storage engine. Fallback if
  the native module misbehaves on Windows: a JSON-file store (lowdb), at the cost of
  filtering/sorting by hand in JS.
- **Database (production/scale):** **A managed relational DB on AWS RDS** — either
  **Postgres** or **MySQL** (both are RDS engines; pick by team familiarity). Gains:
  concurrency, durability, managed backups/failover. SQLite→Postgres/MySQL is a
  believable migration since all three speak SQL.
- **Frontend (assignment):** **Plain HTML + vanilla JS, served by Express, consuming
  the JSON API.** One `index.html` + CSS + a JS file that calls the API with `fetch()`
  and renders the page. **No build step, no framework** — the frontend runs in the
  browser, not Node. Chosen for maximum simplicity/readability (author is not a
  frontend specialist), easy changes (edit a file, refresh), one deployable unit, and a
  clean architecture story (the same JSON API is the single source of truth). Trade-off:
  manual DOM updates, fine at this app's size.
- **Frontend (production/scale):** **A component framework (React or Vue) built to
  static files and served from S3 + CloudFront (CDN)**, decoupled from the API — for
  maintainability once the UI grows to many pages/interactions.
- **Deployment target (assignment):** **A single static EC2 VM** (one `t2.micro`/
  `t3.micro` on the AWS free tier) running Express, which serves both the API and the
  static frontend, with SQLite as a file on its disk. One server, one URL — simplest to
  set up and explain. **Note:** the author has decided to leave the actual AWS deploy to
  the very end and may skip it entirely; a single EC2 VM is sufficient *if* it happens.
- **Deployment target (production/scale):** **ECS running a Docker container** —
  containerize the app and run it on AWS ECS (behind a load balancer), with the DB on
  RDS and the static frontend on S3 + CloudFront. Gives repeatable builds, horizontal
  scaling, and zero-downtime deploys once the product grows.

## Current status

- [x] Read & understood the assignment
- [x] Created this CLAUDE.md
- [x] Stack decisions (Express · SQLite · plain HTML+JS · EC2; see Decisions log)
- [ ] Backend API + DB
- [ ] Frontend UI
- [ ] CSV import
- [ ] README
- [ ] AWS deployment
