// tests/issues.test.js — tests for the /api/issues routes.
//
// Runs under Node's built-in test runner (`npm test` → `node --test`) and uses
// supertest to send HTTP requests at the Express app in-process — no real port
// is opened, so the test is fast and self-contained.

const test = require("node:test");
const assert = require("node:assert/strict");

// IMPORTANT: point the database at an in-memory SQLite instance BEFORE requiring
// db.js or app.js. db.js reads process.env.DB_PATH once, at require time, to
// decide which file to open. Setting it here means the test gets a fresh, empty,
// throwaway database that is discarded when the process exits — it never touches
// the real db/issues.db. ":memory:" is SQLite's special path for that.
process.env.DB_PATH = ":memory:";

const request = require("supertest");
const app = require("../server/app"); // pulls in routes → db, all on the in-memory DB
const db = require("../server/db"); // same shared connection, so we can seed rows

// Seed two issues with known, different createdAt timestamps so we can assert
// both the row count and the newest-first ordering. We insert the OLDER row
// first on purpose, so a correct "ORDER BY createdAt DESC" has to reorder them.
const olderIssue = {
  title: "Late visit",
  description: "Visit week 4 occurred on week 6",
  site: "Site-202",
  severity: "minor",
  status: "in_progress",
  createdAt: "2025-05-03T12:30:00Z",
  updatedAt: "2025-05-03T12:30:00Z",
};
const newerIssue = {
  title: "Drug temp excursion",
  description: "IP stored above max temp for 6 hours",
  site: "Site-101",
  severity: "critical",
  status: "open",
  createdAt: "2025-05-10T08:15:00Z",
  updatedAt: "2025-05-10T08:15:00Z",
};

const insert = db.prepare(
  `INSERT INTO issues (title, description, site, severity, status, createdAt, updatedAt)
   VALUES (@title, @description, @site, @severity, @status, @createdAt, @updatedAt)`
);
insert.run(olderIssue);
insert.run(newerIssue);

test("GET /api/issues returns all issues, newest first", async () => {
  const res = await request(app).get("/api/issues");

  // 200 OK with a JSON array of both seeded issues.
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  assert.equal(res.body.length, 2);

  // Newest-first: the row with the later createdAt comes first.
  assert.equal(res.body[0].title, newerIssue.title);
  assert.equal(res.body[1].title, olderIssue.title);

  // The first row matches the full Issue contract shape: a server-assigned
  // numeric id plus every field we stored.
  const first = res.body[0];
  assert.equal(typeof first.id, "number");
  assert.equal(first.description, newerIssue.description);
  assert.equal(first.site, newerIssue.site);
  assert.equal(first.severity, newerIssue.severity);
  assert.equal(first.status, newerIssue.status);
  assert.equal(first.createdAt, newerIssue.createdAt);
  assert.equal(first.updatedAt, newerIssue.updatedAt);
});

// Filters / search / sort. These run against the SAME two seeded rows above
// (the in-memory DB is shared across this file), which already differ in title,
// status, and severity — enough to exercise every query param without adding
// any rows. As a reminder:
//   olderIssue → "Late visit",          status in_progress, severity minor
//   newerIssue → "Drug temp excursion",  status open,        severity critical
test("GET /api/issues honors search, filter, and sort params", async () => {
  // search: case-insensitive substring on title. "temp" and "DRUG" both match
  // only the "Drug temp excursion" row.
  let res = await request(app).get("/api/issues?search=temp");
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].title, newerIssue.title);

  res = await request(app).get("/api/issues?search=DRUG");
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].title, newerIssue.title);

  // status filter.
  res = await request(app).get("/api/issues?status=open");
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].status, "open");

  res = await request(app).get("/api/issues?status=in_progress");
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].status, "in_progress");

  // severity filter.
  res = await request(app).get("/api/issues?severity=critical");
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].severity, "critical");

  // Combined filters are ANDed together: open+critical is the newer row,
  // open+minor matches nothing.
  res = await request(app).get("/api/issues?status=open&severity=critical");
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].title, newerIssue.title);

  res = await request(app).get("/api/issues?status=open&severity=minor");
  assert.equal(res.body.length, 0);

  // sort=createdAt:asc reverses the default newest-first order, so the older
  // row comes first.
  res = await request(app).get("/api/issues?sort=createdAt:asc");
  assert.equal(res.body.length, 2);
  assert.equal(res.body[0].title, olderIssue.title);
  assert.equal(res.body[1].title, newerIssue.title);

  // An invalid enum value is rejected with 400 and an error message.
  res = await request(app).get("/api/issues?status=banana");
  assert.equal(res.status, 400);
  assert.equal(typeof res.body.error, "string");
});
