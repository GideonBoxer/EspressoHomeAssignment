// app.js — Express application setup. Builds the app but does NOT listen on a port
// (server.js does that) — the split lets tests exercise routes without opening a
// network port.
//
// The app serves the JSON API under /api and the static frontend for everything else.
// One server, one origin — so the frontend uses relative /api paths and needs no CORS.

const path = require("path");
const express = require("express");
const issuesRouter = require("./routes/issues");
const dashboardRouter = require("./routes/dashboard");
const importRouter = require("./routes/import");

const app = express();

// Parse JSON request bodies. This middleware reads the raw body of any request
// with a JSON Content-Type and populates `req.body` with the parsed object, which
// the create/update routes rely on. Without it, `req.body` would be undefined.
// It must run before the routes are mounted so the parsed body is ready by the
// time a route handler runs. (The GET routes don't use a body, so they're
// unaffected.)
app.use(express.json());

// Parse raw CSV request bodies for the import endpoint. This middleware only acts on
// requests whose Content-Type is "text/csv"; it reads the raw body and puts the CSV
// string straight into req.body, which routes/import.js then parses. Requests with any
// other content type (e.g. the JSON routes above) are left untouched, so the two body
// parsers do not interfere with each other.
app.use(express.text({ type: "text/csv" }));

// API routes. Each resource gets its own router file under routes/ and is
// mounted here under its /api base path. The issues router handles everything
// below /api/issues (e.g. GET /api/issues for the list).
//
// These are mounted BEFORE the static frontend below so that an /api/... request
// is always handled by its router and never mistaken for a static file.
app.use("/api/issues", issuesRouter);

// Dashboard summary. Its own router (counts, not CRUD) mounted at its own top-level
// /api path — it is NOT under /api/issues.
app.use("/api/dashboard", dashboardRouter);

// CSV import. Its own router mounted at its own top-level /api path (it is NOT under
// /api/issues). Accepts a raw text/csv body and bulk-creates issues from it.
app.use("/api/import", importRouter);

// Static frontend. Everything that is not an /api route is served as a plain file
// from the frontend/ directory (index.html, styles.css, app.js). express.static
// serves "/" as frontend/index.html automatically, so visiting http://localhost:3000/
// loads the UI. The frontend then talks to the API above via relative /api paths.
//
// __dirname is this file's folder (server/), so we go up one level to the repo root
// and into frontend/.
app.use(express.static(path.join(__dirname, "..", "frontend")));

module.exports = app;
