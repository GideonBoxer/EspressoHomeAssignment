// app.js — Express application setup.
//
// This file builds the Express "app" (the thing that knows how to handle HTTP
// requests) but does NOT start listening on a port — that is server.js's job.
// Keeping the two separate means tests can import the app and exercise routes
// without actually opening a network port.
//
// The /api routes are mounted below; the static frontend will be added here in a
// later step.

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

// Landing / health-check route. Visiting http://localhost:3000/ returns this
// plain text, which proves the server is up and handling requests.
app.get("/", (req, res) => {
  res.send("Trial Issue Log — server is running.");
});

// API routes. Each resource gets its own router file under routes/ and is
// mounted here under its /api base path. The issues router handles everything
// below /api/issues (e.g. GET /api/issues for the list).
app.use("/api/issues", issuesRouter);

// Dashboard summary. Its own router (counts, not CRUD) mounted at its own top-level
// /api path — it is NOT under /api/issues.
app.use("/api/dashboard", dashboardRouter);

// CSV import. Its own router mounted at its own top-level /api path (it is NOT under
// /api/issues). Accepts a raw text/csv body and bulk-creates issues from it.
app.use("/api/import", importRouter);

module.exports = app;
