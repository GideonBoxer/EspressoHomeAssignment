// tests/import.test.js — tests for the POST /api/import route.
//
// Runs under Node's built-in test runner (`npm test` → `node --test`) and uses supertest
// to send HTTP requests at the Express app in-process — no real port is opened. As with
// the other test files, `node --test` runs each test FILE in its own process, so this
// file gets a fresh, isolated in-memory database.
//
// These tests feed the REAL issues.csv from the repo root through the endpoint, so they
// double as a check that the provided sample data imports cleanly.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

// IMPORTANT: point the database at an in-memory SQLite instance BEFORE requiring db.js or
// app.js (db.js reads process.env.DB_PATH once, at require time). This gives the test a
// fresh, throwaway database that never touches the real db/issues.db.
process.env.DB_PATH = ":memory:";

const request = require("supertest");
const app = require("../server/app"); // pulls in routes → db, all on the in-memory DB

// The real sample CSV that ships in the repo (header + 4 rows). Reading it here means the
// happy-path test imports exactly what a reviewer would upload.
const sampleCsv = fs.readFileSync(
  path.join(__dirname, "..", "issues.csv"),
  "utf8"
);

// Small helper: POST a CSV string to /api/import with the right content type. Keeping it
// in one place stops every test from repeating the .set(...).send(...) boilerplate.
function importCsv(csvText) {
  return request(app)
    .post("/api/import")
    .set("Content-Type", "text/csv")
    .send(csvText);
}

test("POST /api/import imports the sample issues.csv and returns { imported: 4 }", async () => {
  const res = await importCsv(sampleCsv);

  // 200 OK with the contract's { imported: N } shape.
  assert.equal(res.status, 200);
  assert.equal(res.body.imported, 4);

  // The rows really landed: the list now returns all four.
  const list = await request(app).get("/api/issues");
  assert.equal(list.status, 200);
  assert.equal(list.body.length, 4);

  // Spot-check one row round-trips its fields. The list is newest-first, so the row with
  // the latest createdAt ("Unblinded email", 2025-05-14) comes first.
  const newest = list.body[0];
  assert.equal(newest.title, "Unblinded email");
  assert.equal(newest.site, "Site-303");
  assert.equal(newest.severity, "major");
  assert.equal(newest.status, "resolved");
});

test("POST /api/import preserves createdAt from the CSV (not the server clock)", async () => {
  // Find the "Missing consent form" row that the previous test imported. Its CSV
  // createdAt is 2025-05-01T09:00:00Z — proving the value came from the file, the import
  // must store exactly that, with updatedAt equal to it (an imported row is unedited).
  const list = await request(app).get("/api/issues");
  const row = list.body.find((issue) => issue.title === "Missing consent form");

  assert.ok(row, "expected the imported 'Missing consent form' row to exist");
  assert.equal(row.createdAt, "2025-05-01T09:00:00Z");
  assert.equal(row.updatedAt, "2025-05-01T09:00:00Z");
});

test("POST /api/import rejects a bad enum value with 400 and imports nothing", async () => {
  // Count the rows before, so we can prove the failed import left the table unchanged
  // (all-or-nothing rollback) rather than assuming a fixed total.
  const before = await request(app).get("/api/issues");
  const countBefore = before.body.length;

  // One header + one data row whose severity is invalid.
  const badCsv =
    "title,description,site,severity,status,createdAt\n" +
    "Bad row,has an invalid severity,Site-101,huge,open,2025-05-01T09:00:00Z\n";

  const res = await importCsv(badCsv);
  assert.equal(res.status, 400);
  assert.equal(typeof res.body.error, "string");

  // Nothing was imported: the count is unchanged.
  const after = await request(app).get("/api/issues");
  assert.equal(after.body.length, countBefore);
});

test("POST /api/import rejects a row missing a required field with 400 and imports nothing", async () => {
  const before = await request(app).get("/api/issues");
  const countBefore = before.body.length;

  // The single data row has a blank title, which is a required field.
  const badCsv =
    "title,description,site,severity,status,createdAt\n" +
    ",description without a title,Site-101,minor,open,2025-05-01T09:00:00Z\n";

  const res = await importCsv(badCsv);
  assert.equal(res.status, 400);
  assert.equal(typeof res.body.error, "string");

  const after = await request(app).get("/api/issues");
  assert.equal(after.body.length, countBefore);
});

test("POST /api/import rejects an empty body with 400", async () => {
  const res = await importCsv("");

  assert.equal(res.status, 400);
  assert.equal(typeof res.body.error, "string");
});
