// routes/import.js — HTTP route for bulk-importing issues from a CSV (the /api/import path).
//
// An Express "router" mounted by app.js under "/api/import". It holds a single route,
// POST /, that ingests a whole CSV of issues in one request — what the frontend's
// "Upload batch (CSV)" control calls.
//
// HOW THE CSV ARRIVES: the client sends the raw CSV text as the request body with
// Content-Type: text/csv. app.js has an express.text() middleware for that content
// type, so req.body is the CSV as a plain string (no file upload, no extra dependency).
//
// IMPORTANT — createdAt is PRESERVED from the CSV (this differs from POST /api/issues).
// The create route stamps createdAt with the server clock, but an import is loading
// PRE-EXISTING issues that already have their own history. The provided sample data
// ships real dates (e.g. 2025-05-01), and the list's "newest-first" sort and the
// dashboard counts only make sense if we keep those original timestamps. So on import,
// createdAt comes from the file (with updatedAt set equal to it, since an imported row
// has not been edited yet). createdAt is only stamped with "now" as a fallback if a row
// happens to omit it.
//
// VALIDATION is all-or-nothing: we validate EVERY row first and bail with a single 400
// on the first bad row, importing nothing. Only once all rows pass do we insert them,
// inside one transaction. This keeps the outcome easy to reason about — an import either
// fully succeeds or changes nothing — and reuses the exact same validation helpers as
// the create route so the rules stay identical.

const express = require("express");
const { parse } = require("csv-parse/sync"); // synchronous parser, matches our sync DB style
const db = require("../db"); // the one shared SQLite connection opened in db.js

// Shared validation helpers and the enum value lists — the same ones POST /api/issues
// uses, so an imported row must satisfy exactly the same rules as a created one.
const {
  STATUSES,
  SEVERITIES,
  requireNonEmptyString,
  validateEnum,
} = require("../validation");

const router = express.Router();

// POST /api/import — import many issues from a CSV body.
//
// Input:
//   request body — raw CSV text (string), sent with Content-Type: text/csv.
//   Header row: title,description,site,severity,status,createdAt. Per-column types
//   match the create body:
//     title        (string, required)       — non-empty
//     description  (string, required)       — non-empty
//     site         (string, optional)       — blank cell → null
//     severity     (string enum, optional)  — minor|major|critical (blank → minor)
//     status       (string enum, optional)  — open|in_progress|resolved (blank → open)
//     createdAt    (ISO-8601 string)        — preserved from the CSV (blank → now)
// Output:
//   200 → { "imported": N }   — N rows inserted (all-or-nothing, inside one transaction)
//   400 → { "error": ... }    — empty body, unparseable CSV, or any invalid row;
//                               imports nothing in that case
router.post("/", (req, res) => {
  // Guard the body. The express.text() middleware sets req.body to the raw string for a
  // text/csv request; for anything else it may be an object or undefined. We only accept
  // a non-empty string here.
  const csvText = typeof req.body === "string" ? req.body : "";
  if (csvText.trim() === "") {
    return res.status(400).json({
      error: "Request body must be a non-empty CSV sent with Content-Type: text/csv",
    });
  }

  // Parse the CSV into an array of row objects keyed by the header columns
  // (title, description, site, severity, status, createdAt).
  //   columns: true        — use the first line as the header / object keys
  //   skip_empty_lines     — ignore blank lines, e.g. a trailing newline at end of file
  //   trim                 — strip surrounding whitespace from every field
  // A structurally broken CSV (e.g. a row with the wrong number of columns) makes the
  // parser throw; we catch it and turn it into a clean 400 instead of a 500.
  let records;
  try {
    records = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch (err) {
    return res.status(400).json({ error: `Could not parse CSV: ${err.message}` });
  }

  // Validate EVERY row up front and collect the cleaned rows to insert. We do not touch
  // the database until all rows pass, which is what makes the import all-or-nothing.
  const rowsToInsert = [];
  for (let i = 0; i < records.length; i++) {
    const record = records[i];

    // Row number for error messages: the header is line 1, so the first data row is
    // line 2. This points the user at the offending line in their file.
    const rowNumber = i + 2;

    // title / description — required non-empty strings (same rule as create).
    const titleError = requireNonEmptyString(record.title, "title");
    if (titleError !== null) {
      return res.status(400).json({ error: `Row ${rowNumber}: ${titleError}` });
    }
    const descriptionError = requireNonEmptyString(record.description, "description");
    if (descriptionError !== null) {
      return res.status(400).json({ error: `Row ${rowNumber}: ${descriptionError}` });
    }

    // severity / status — optional in the CSV: a blank cell falls back to the contract's
    // default (minor / open), exactly like an omitted field on create. A present value
    // must be a valid enum member; validateEnum returns an error string if not.
    const severity =
      record.severity && record.severity !== "" ? record.severity : "minor";
    const severityError = validateEnum(severity, SEVERITIES, "severity");
    if (severityError !== null) {
      return res.status(400).json({ error: `Row ${rowNumber}: ${severityError}` });
    }
    const status = record.status && record.status !== "" ? record.status : "open";
    const statusError = validateEnum(status, STATUSES, "status");
    if (statusError !== null) {
      return res.status(400).json({ error: `Row ${rowNumber}: ${statusError}` });
    }

    // site — optional; store null when the cell is blank or missing.
    const site = record.site && record.site !== "" ? record.site : null;

    // createdAt — PRESERVED from the CSV (see the file header for why). Only if a row
    // omits it do we fall back to the current time. updatedAt is set equal to createdAt
    // because an imported row has not been edited since it was created.
    const createdAt =
      record.createdAt && record.createdAt !== ""
        ? record.createdAt
        : new Date().toISOString();

    rowsToInsert.push({
      title: record.title,
      description: record.description,
      site,
      severity,
      status,
      createdAt,
      updatedAt: createdAt,
    });
  }

  // Insert every validated row inside ONE transaction. better-sqlite3's db.transaction()
  // wraps the loop so that if any single insert were to fail (e.g. a DB-level CHECK we
  // somehow missed in validation), the whole batch rolls back and nothing is imported —
  // the same all-or-nothing guarantee, now backed by the database itself.
  const insert = db.prepare(
    `INSERT INTO issues (title, description, site, severity, status, createdAt, updatedAt)
     VALUES (@title, @description, @site, @severity, @status, @createdAt, @updatedAt)`
  );
  const insertAll = db.transaction((rows) => {
    for (const row of rows) {
      insert.run(row);
    }
  });
  insertAll(rowsToInsert);

  // Report how many rows were imported, per the contract.
  res.status(200).json({ imported: rowsToInsert.length });
});

module.exports = router;
