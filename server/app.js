// app.js — Express application setup.
//
// This file builds the Express "app" (the thing that knows how to handle HTTP
// requests) but does NOT start listening on a port — that is server.js's job.
// Keeping the two separate means tests can import the app and exercise routes
// without actually opening a network port.
//
// For now the app is intentionally tiny: a single proof-of-life route so we can
// confirm the server runs and responds in a browser. The real /api routes and
// the static frontend will be mounted here in later steps.

const express = require("express");

const app = express();

// Landing / health-check route. Visiting http://localhost:3000/ returns this
// plain text, which proves the server is up and handling requests.
app.get("/", (req, res) => {
  res.send("Trial Issue Log — server is running.");
});

module.exports = app;
