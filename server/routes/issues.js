// routes/issues.js — HTTP routes for the `issues` resource (the /api/issues path).
//
// This file is an Express "router": a small, self-contained group of routes that
// app.js mounts under a base path (here, "/api/issues"). Keeping the issues
// routes in their own file — separate from app.js and from the dashboard/import
// routes — means each file has one clear job and stays short enough to read
// top-to-bottom.
//
// For now this file holds the list route with search/filter/sort. The remaining
// CRUD verbs (POST/GET-by-id/PUT/DELETE) will be added here in later steps.

const express = require("express");
const db = require("../db"); // the one shared SQLite connection opened in db.js

const router = express.Router();

// The allowed enum values, straight from the API contract. Kept here as plain
// arrays so we can both validate incoming filter values and build a helpful
// error message. (These will likely move to a shared validation.js later, once
// the create/update routes need the same lists.)
const STATUSES = ["open", "in_progress", "resolved"];
const SEVERITIES = ["minor", "major", "critical"];

// GET /api/issues — list issues, with optional search / filter / sort.
//
// Query params (all optional, from the contract):
//   search    — case-insensitive substring match on `title`
//   status    — exact match, must be one of STATUSES
//   severity  — exact match, must be one of SEVERITIES
//   sort      — only `createdAt:asc` / `createdAt:desc` (default: createdAt:desc)
//
// The `issues` table columns line up exactly with the contract's Issue JSON
// shape, so each row is sent to the client as-is with no field mapping.
router.get("/", (req, res) => {
  const { search, status, severity, sort } = req.query;

  // Validate the enum filters up front. An unknown value almost certainly means
  // a client bug or a typo, so we fail loudly with 400 rather than silently
  // returning an empty list (which would look like "no issues").
  if (status !== undefined && !STATUSES.includes(status)) {
    return res
      .status(400)
      .json({ error: `Invalid status: must be one of ${STATUSES.join(", ")}` });
  }
  if (severity !== undefined && !SEVERITIES.includes(severity)) {
    return res
      .status(400)
      .json({ error: `Invalid severity: must be one of ${SEVERITIES.join(", ")}` });
  }

  // Build the WHERE clause one condition at a time. We collect SQL fragments in
  // `conditions` and the matching values in `params`, then join them. Every
  // user-supplied value goes in as a NAMED bind parameter (@name) — never
  // string-concatenated — so there is no SQL-injection surface.
  const conditions = [];
  const params = {};

  if (search !== undefined) {
    // SQLite's LIKE is case-insensitive for ASCII text by default, which is
    // exactly the "case-insensitive substring on title" the contract asks for.
    // We wrap the bound value in %...% so it matches anywhere in the title.
    conditions.push("title LIKE '%' || @search || '%'");
    params.search = search;
  }
  if (status !== undefined) {
    conditions.push("status = @status");
    params.status = status;
  }
  if (severity !== undefined) {
    conditions.push("severity = @severity");
    params.severity = severity;
  }

  const whereClause =
    conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

  // Sort direction. The only sortable column is createdAt (per the contract), so
  // we never interpolate a user-supplied column name. The direction is chosen
  // from our own fixed "ASC"/"DESC" literals — also safe to interpolate. Default
  // is newest-first; only the exact value "createdAt:asc" flips it.
  const direction = sort === "createdAt:asc" ? "ASC" : "DESC";

  const sql = `SELECT * FROM issues ${whereClause} ORDER BY createdAt ${direction}`;

  // .all(params) runs the query with the bound values and returns the matching
  // rows as an array of plain objects ([] when nothing matches).
  const issues = db.prepare(sql).all(params);
  res.json(issues);
});

// GET /api/issues/:id — fetch one issue by its id (the "detail" / read-one route).
//
// Three things make this different from the list route above:
//   1. The id comes from the URL PATH (req.params.id), not the query string.
//   2. It returns a single Issue OBJECT, not an array.
//   3. A missing id is an error (404), whereas an empty filter result is a valid [].
//
// We use .get() instead of .all(): .get() returns the first matching row as a plain
// object, or `undefined` when nothing matches — and that `undefined` is exactly the
// signal we need for the 404 case. The id is passed as a NAMED bind parameter (@id),
// same as the list route's filters, so there is no SQL-injection surface.
//
// Note on non-numeric ids (e.g. /api/issues/abc): SQLite's id column is an integer,
// so a non-numeric value simply matches no row and falls through to the 404 below.
// The contract only specifies 200 / 404 for this endpoint, so that is all we handle.
router.get("/:id", (req, res) => {
  const issue = db
    .prepare("SELECT * FROM issues WHERE id = @id")
    .get({ id: req.params.id });

  if (issue === undefined) {
    return res
      .status(404)
      .json({ error: `No issue found with id ${req.params.id}` });
  }

  // The `issues` columns line up with the contract's Issue shape, so we send the
  // row as-is with no field mapping (same as the list route).
  res.json(issue);
});

module.exports = router;
