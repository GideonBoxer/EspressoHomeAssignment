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

// Shared validation helpers and the enum value lists. Each helper returns an
// error-message string when the value is invalid, or null when it is fine — so a
// route validates a field by calling a helper and bailing with 400 on a non-null
// result. See server/validation.js.
const {
  STATUSES,
  SEVERITIES,
  requireNonEmptyString,
  validateEnum,
} = require("../validation");

const router = express.Router();

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
  // returning an empty list (which would look like "no issues"). validateEnum
  // treats an absent (undefined) filter as valid, so omitting a filter is fine.
  const statusError = validateEnum(status, STATUSES, "status");
  if (statusError !== null) {
    return res.status(400).json({ error: statusError });
  }
  const severityError = validateEnum(severity, SEVERITIES, "severity");
  if (severityError !== null) {
    return res.status(400).json({ error: severityError });
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

// POST /api/issues — create a new issue.
//
// The client sends a JSON body (parsed into req.body by the express.json()
// middleware in app.js). We validate it, let the server fill in the fields the
// client must NOT control (id and the timestamps), insert the row, then return
// the created issue with 201.
//
// Validation strategy: we check the input here and return a clean 400 with an
// { error } message on the first problem. The database's NOT NULL / CHECK
// constraints are a backstop, but catching bad input in the route gives the
// client a helpful message instead of a raw database exception.
router.post("/", (req, res) => {
  // Guard against a completely missing body (e.g. no JSON sent at all), so the
  // field reads below never throw on `undefined`.
  const body = req.body || {};
  const { title, description, site, severity, status } = body;

  // title — required, must be a non-empty string (after trimming whitespace, so
  // "   " does not count as a real title).
  const titleError = requireNonEmptyString(title, "title");
  if (titleError !== null) {
    return res.status(400).json({ error: titleError });
  }

  // description — same rule as title.
  const descriptionError = requireNonEmptyString(description, "description");
  if (descriptionError !== null) {
    return res.status(400).json({ error: descriptionError });
  }

  // site — optional. If the client sends it, it must be a string; if omitted we
  // store null (the column is nullable). This "string if present, empty allowed"
  // rule is a one-off, so it stays inline rather than becoming a shared helper.
  if (site !== undefined && typeof site !== "string") {
    return res.status(400).json({ error: "site must be a string" });
  }

  // severity — optional on create; defaults to "minor" below. validateEnum lets
  // an omitted value through and only rejects a present-but-unknown one.
  const severityError = validateEnum(severity, SEVERITIES, "severity");
  if (severityError !== null) {
    return res.status(400).json({ error: severityError });
  }

  // status — optional on create; defaults to "open" below (same rule as severity).
  const statusError = validateEnum(status, STATUSES, "status");
  if (statusError !== null) {
    return res.status(400).json({ error: statusError });
  }

  // Server-controlled fields. createdAt and updatedAt are identical on create;
  // updatedAt will diverge once the issue is edited. ISO-8601 strings sort
  // correctly as text, which is what the list route's ORDER BY relies on.
  const now = new Date().toISOString();

  // Insert with named bind parameters (never string concatenation), applying the
  // contract's defaults for any omitted optional fields.
  const info = db
    .prepare(
      `INSERT INTO issues (title, description, site, severity, status, createdAt, updatedAt)
       VALUES (@title, @description, @site, @severity, @status, @createdAt, @updatedAt)`
    )
    .run({
      title,
      description,
      site: site !== undefined ? site : null,
      severity: severity !== undefined ? severity : "minor",
      status: status !== undefined ? status : "open",
      createdAt: now,
      updatedAt: now,
    });

  // Read the row back by its new id and return that, rather than echoing the
  // input. This guarantees the response is exactly what was stored (including the
  // server-assigned id and any defaults that were applied) — the same approach as
  // the GET-by-id route below.
  const created = db
    .prepare("SELECT * FROM issues WHERE id = @id")
    .get({ id: info.lastInsertRowid });

  res.status(201).json(created);
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
