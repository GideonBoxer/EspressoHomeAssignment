// tests/dashboard.test.js — tests for the /api/dashboard route.
//
// Runs under Node's built-in test runner (`npm test` → `node --test`) and uses
// supertest to send HTTP requests at the Express app in-process — no real port is
// opened. `node --test` runs each test FILE in its own process, so this file gets a
// fresh, isolated in-memory database: we can seed a known set of rows and assert
// EXACT counts without interference from the issues tests.

const test = require("node:test");
const assert = require("node:assert/strict");

// IMPORTANT: point the database at an in-memory SQLite instance BEFORE requiring
// db.js or app.js (db.js reads process.env.DB_PATH once, at require time). This gives
// the test a fresh, throwaway database that never touches the real db/issues.db.
process.env.DB_PATH = ":memory:";

const request = require("supertest");
const app = require("../server/app"); // pulls in routes → db, all on the in-memory DB
const db = require("../server/db"); // same shared connection, so we can seed rows

// Seed a deliberate spread of three issues. The point is to land counts in several
// buckets while leaving one status bucket ("resolved") at zero, so the test proves
// that zero-count buckets still appear in the response.
//
//   row 1 → open        / critical
//   row 2 → open        / minor
//   row 3 → in_progress / major
//
// Expected: byStatus   { open: 2, in_progress: 1, resolved: 0 }
//           bySeverity { minor: 1, major: 1, critical: 1 }
const seedRows = [
  { status: "open", severity: "critical" },
  { status: "open", severity: "minor" },
  { status: "in_progress", severity: "major" },
];

const insert = db.prepare(
  `INSERT INTO issues (title, description, site, severity, status, createdAt, updatedAt)
   VALUES (@title, @description, @site, @severity, @status, @createdAt, @updatedAt)`
);
const now = "2025-05-01T09:00:00Z";
for (const row of seedRows) {
  insert.run({
    title: "seed",
    description: "seed",
    site: null,
    severity: row.severity,
    status: row.status,
    createdAt: now,
    updatedAt: now,
  });
}

test("GET /api/dashboard returns counts by status and by severity", async () => {
  const res = await request(app).get("/api/dashboard");

  // 200 OK with the two-group summary object.
  assert.equal(res.status, 200);

  // Exact counts, including resolved:0 — deepEqual also proves the zero bucket is
  // present (not omitted) and that no unexpected keys leaked in.
  assert.deepEqual(res.body.byStatus, {
    open: 2,
    in_progress: 1,
    resolved: 0,
  });
  assert.deepEqual(res.body.bySeverity, {
    minor: 1,
    major: 1,
    critical: 1,
  });

  // The two groups are the same issues sliced two ways, so each sums to the total
  // number of seeded rows (3).
  const statusTotal =
    res.body.byStatus.open +
    res.body.byStatus.in_progress +
    res.body.byStatus.resolved;
  const severityTotal =
    res.body.bySeverity.minor +
    res.body.bySeverity.major +
    res.body.bySeverity.critical;
  assert.equal(statusTotal, seedRows.length);
  assert.equal(severityTotal, seedRows.length);
});
