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

test("GET /api/issues/:id returns a single issue for an existing id", async () => {
  // Discover a real, server-assigned id from the list rather than hardcoding one
  // (ids are auto-incremented, so we don't want the test to assume a value).
  const list = await request(app).get("/api/issues");
  const existing = list.body[0];

  const res = await request(app).get(`/api/issues/${existing.id}`);

  // 200 OK with the matching Issue as a single object (not an array).
  assert.equal(res.status, 200);
  assert.ok(!Array.isArray(res.body));
  assert.equal(res.body.id, existing.id);
  assert.equal(res.body.title, existing.title);
});

test("GET /api/issues/:id returns 404 for an id that doesn't exist", async () => {
  // Only two rows are seeded, so id 99999 cannot exist.
  const res = await request(app).get("/api/issues/99999");

  // 404 with the contract's { "error": "..." } shape.
  assert.equal(res.status, 404);
  assert.equal(typeof res.body.error, "string");
});

test("GET /api/issues/:id returns 404 for a non-numeric id", async () => {
  // The id column is an integer, so a non-numeric value like "abc" matches no
  // row and falls through to the same 404 as a missing id (the contract only
  // specifies 200 / 404 for this endpoint).
  const res = await request(app).get("/api/issues/abc");

  assert.equal(res.status, 404);
  assert.equal(typeof res.body.error, "string");
});

// --- POST /api/issues (create) ---------------------------------------------
//
// These tests run after the GET tests above. Node's test runner executes the
// tests in this file in definition order, so the seeded-count assertions (which
// expect exactly 2 rows) all run BEFORE the creates below add any rows — making
// it safe to append here. The success test still avoids hardcoding a total by
// measuring the list length before and after, and asserting it grew by one.

test("POST /api/issues creates an issue and returns 201", async () => {
  // Count the rows before, so we can assert the create added exactly one without
  // depending on how many rows other tests have inserted.
  const before = await request(app).get("/api/issues");
  const countBefore = before.body.length;

  // A valid body. We deliberately OMIT `status` so the route applies its default
  // ("open"); `severity` is sent explicitly so we can assert it round-trips.
  const payload = {
    title: "Missing consent form",
    description: "Consent form not in file for patient 003",
    site: "Site-101",
    severity: "major",
  };

  const res = await request(app).post("/api/issues").send(payload);

  // 201 Created with the new Issue as a single object.
  assert.equal(res.status, 201);
  assert.ok(!Array.isArray(res.body));

  // Server-assigned id, and the fields we sent come back unchanged.
  assert.equal(typeof res.body.id, "number");
  assert.equal(res.body.title, payload.title);
  assert.equal(res.body.description, payload.description);
  assert.equal(res.body.site, payload.site);
  assert.equal(res.body.severity, payload.severity);

  // Defaults applied for the omitted field, and timestamps set by the server.
  assert.equal(res.body.status, "open");
  assert.equal(typeof res.body.createdAt, "string");
  assert.ok(res.body.createdAt.length > 0);
  assert.equal(res.body.updatedAt, res.body.createdAt); // equal on create

  // It was really persisted: fetching it by id returns the same issue...
  const fetched = await request(app).get(`/api/issues/${res.body.id}`);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.id, res.body.id);
  assert.equal(fetched.body.title, payload.title);

  // ...and the list grew by exactly one.
  const after = await request(app).get("/api/issues");
  assert.equal(after.body.length, countBefore + 1);
});

// Failure cases. A request is just data, so an invalid request is as easy to
// build as a valid one: we send a body that breaks one validation rule and
// assert the route rejects it with 400 + the contract's { error } shape. Each
// rule gets its own small test so a failure points at exactly what broke.

test("POST /api/issues rejects a missing title with 400", async () => {
  const res = await request(app)
    .post("/api/issues")
    .send({ description: "no title here" });

  assert.equal(res.status, 400);
  assert.equal(typeof res.body.error, "string");
});

test("POST /api/issues rejects a missing description with 400", async () => {
  const res = await request(app)
    .post("/api/issues")
    .send({ title: "no description here" });

  assert.equal(res.status, 400);
  assert.equal(typeof res.body.error, "string");
});

test("POST /api/issues rejects a blank (whitespace-only) title with 400", async () => {
  const res = await request(app)
    .post("/api/issues")
    .send({ title: "   ", description: "valid" });

  assert.equal(res.status, 400);
  assert.equal(typeof res.body.error, "string");
});

test("POST /api/issues rejects an invalid severity with 400", async () => {
  const res = await request(app)
    .post("/api/issues")
    .send({ title: "valid", description: "valid", severity: "huge" });

  assert.equal(res.status, 400);
  assert.equal(typeof res.body.error, "string");
});

test("POST /api/issues rejects an invalid status with 400", async () => {
  const res = await request(app)
    .post("/api/issues")
    .send({ title: "valid", description: "valid", status: "banana" });

  assert.equal(res.status, 400);
  assert.equal(typeof res.body.error, "string");
});

// --- PUT /api/issues/:id (update) -------------------------------------------
//
// Each test first creates its own issue via POST and operates on that returned
// id, so it never depends on the seeded rows (whose count earlier tests assert).

test("PUT /api/issues/:id updates the sent fields and leaves the rest unchanged", async () => {
  // Create a known issue to edit.
  const created = await request(app).post("/api/issues").send({
    title: "Original title",
    description: "Original description",
    site: "Site-101",
    severity: "minor",
    status: "open",
  });
  const { id } = created.body;

  // Send a PARTIAL update: only title and status. description/site/severity are
  // omitted and must keep their original values.
  const res = await request(app)
    .put(`/api/issues/${id}`)
    .send({ title: "Updated title", status: "in_progress" });

  // 200 OK with the updated Issue as a single object.
  assert.equal(res.status, 200);
  assert.ok(!Array.isArray(res.body));

  // Sent fields changed...
  assert.equal(res.body.title, "Updated title");
  assert.equal(res.body.status, "in_progress");

  // ...omitted fields unchanged.
  assert.equal(res.body.description, "Original description");
  assert.equal(res.body.site, "Site-101");
  assert.equal(res.body.severity, "minor");

  // createdAt is untouched; updatedAt was refreshed by the server (so it differs).
  assert.equal(res.body.createdAt, created.body.createdAt);
  assert.equal(typeof res.body.updatedAt, "string");
  assert.notEqual(res.body.updatedAt, created.body.updatedAt);

  // It really persisted: fetching by id returns the updated values.
  const fetched = await request(app).get(`/api/issues/${id}`);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.title, "Updated title");
  assert.equal(fetched.body.status, "in_progress");
});

test("PUT /api/issues/:id resolves an issue (status -> resolved)", async () => {
  const created = await request(app).post("/api/issues").send({
    title: "To be resolved",
    description: "An open issue",
    status: "open",
  });

  const res = await request(app)
    .put(`/api/issues/${created.body.id}`)
    .send({ status: "resolved" });

  assert.equal(res.status, 200);
  assert.equal(res.body.status, "resolved");
});

test("PUT /api/issues/:id returns 404 for an id that doesn't exist", async () => {
  const res = await request(app)
    .put("/api/issues/99999")
    .send({ status: "resolved" });

  assert.equal(res.status, 404);
  assert.equal(typeof res.body.error, "string");
});

test("PUT /api/issues/:id rejects an invalid status with 400", async () => {
  const created = await request(app)
    .post("/api/issues")
    .send({ title: "valid", description: "valid" });

  const res = await request(app)
    .put(`/api/issues/${created.body.id}`)
    .send({ status: "banana" });

  assert.equal(res.status, 400);
  assert.equal(typeof res.body.error, "string");
});

test("PUT /api/issues/:id rejects blanking out a required field with 400", async () => {
  const created = await request(app)
    .post("/api/issues")
    .send({ title: "valid", description: "valid" });

  // A whitespace-only title is not a real value, so it must be rejected.
  const res = await request(app)
    .put(`/api/issues/${created.body.id}`)
    .send({ title: "   " });

  assert.equal(res.status, 400);
  assert.equal(typeof res.body.error, "string");
});

// --- DELETE /api/issues/:id (delete) ----------------------------------------
//
// Like the PUT tests, each test creates its own issue via POST and operates on
// that returned id, so it never depends on the seeded rows.

test("DELETE /api/issues/:id deletes the issue and returns 204", async () => {
  // Create a known issue to delete.
  const created = await request(app)
    .post("/api/issues")
    .send({ title: "To be deleted", description: "A doomed issue" });
  const { id } = created.body;

  const res = await request(app).delete(`/api/issues/${id}`);

  // 204 No Content with an empty body.
  assert.equal(res.status, 204);
  assert.deepEqual(res.body, {});

  // It really went away: fetching it by id now returns 404.
  const fetched = await request(app).get(`/api/issues/${id}`);
  assert.equal(fetched.status, 404);
});

test("DELETE /api/issues/:id returns 404 for an id that doesn't exist", async () => {
  const res = await request(app).delete("/api/issues/99999");

  assert.equal(res.status, 404);
  assert.equal(typeof res.body.error, "string");
});

test("DELETE /api/issues/:id returns 404 for a non-numeric id", async () => {
  // The id column is an integer, so a non-numeric value like "abc" matches no
  // row and falls through to the same 404 as a missing id (mirrors GET /:id).
  const res = await request(app).delete("/api/issues/abc");

  assert.equal(res.status, 404);
  assert.equal(typeof res.body.error, "string");
});
