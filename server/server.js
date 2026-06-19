// server.js — entry point. This is the file `npm start` runs.
//
// Its only job is to start the HTTP server. The Express app lives in app.js and
// the database connection lives in db.js; this file wires them together and
// begins listening.

const app = require("./app");
const db = require("./db"); // opens the SQLite DB and applies the schema on boot

// The port comes from the environment when provided (e.g. on the deploy server)
// and otherwise defaults to 3000 for local development.
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);

  // Quick confirmation that the database opened and the schema is in place.
  // This is just a startup sanity check, not an API endpoint.
  const count = db.prepare("SELECT COUNT(*) AS n FROM issues").get().n;
  console.log(`Database ready — issues table has ${count} row(s).`);
});
