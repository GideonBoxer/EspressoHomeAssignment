// routes/dashboard.js — HTTP route for the dashboard summary (the /api/dashboard path).
//
// An Express "router" mounted by app.js under "/api/dashboard". It holds a single
// read-only route that powers the dashboard page: counts of issues grouped by status
// and by severity (aggregates, not CRUD — which is why it is separate from issues.js).

const express = require("express");
const db = require("../db"); // the one shared SQLite connection opened in db.js

// The enum value lists from the contract. We reuse them here so the response always
// includes EVERY status/severity, even ones with a count of zero (see below).
const { STATUSES, SEVERITIES } = require("../validation");

const router = express.Router();

// GET /api/dashboard — counts of issues by status and by severity.
//
// Response shape (from the contract):
//   { "byStatus":   { "open": N, "in_progress": N, "resolved": N },
//     "bySeverity": { "minor": N, "major": N, "critical": N } }
//
// The two groups are the SAME issues sliced two different ways, so each group sums to
// the total number of issues. There is no input to validate (no params, no body), so
// this handler is just "query, shape, respond".
//
// Why we count in SQL: letting the database GROUP BY does the counting where the data
// lives and returns only a handful of numbers, instead of shipping every row to be
// counted in JavaScript. That keeps the payload tiny no matter how many issues exist.
router.get("/", (req, res) => {
  // Two small aggregate queries. Each returns one row per value that actually appears
  // in the table, e.g. [{ status: "open", count: 2 }, { status: "resolved", count: 1 }].
  // A value with no issues simply does not appear in these results — which is why we
  // seed all the zeros first, below.
  const statusRows = db
    .prepare("SELECT status, COUNT(*) AS count FROM issues GROUP BY status")
    .all();
  const severityRows = db
    .prepare("SELECT severity, COUNT(*) AS count FROM issues GROUP BY severity")
    .all();

  // Build each group starting from every enum value at 0, so the response always
  // contains all the keys the frontend expects (it can render fixed chips without
  // checking which keys are present). Then overwrite with the real counts from SQL.
  const byStatus = {};
  for (const status of STATUSES) {
    byStatus[status] = 0;
  }
  for (const row of statusRows) {
    byStatus[row.status] = row.count;
  }

  const bySeverity = {};
  for (const severity of SEVERITIES) {
    bySeverity[severity] = 0;
  }
  for (const row of severityRows) {
    bySeverity[row.severity] = row.count;
  }

  res.json({ byStatus, bySeverity });
});

module.exports = router;
