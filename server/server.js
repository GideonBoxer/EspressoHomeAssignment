// server.js — entry point (`npm start`). Its only job is to wire the Express app
// (app.js) and the database (db.js) together and start listening.

const app = require("./app");
const db = require("./db"); // opens the SQLite DB and applies the schema on boot

// The port comes from the environment when provided (e.g. on the deploy server)
// and otherwise defaults to 3000 for local development.
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);

  // Startup sanity check that the database opened and the schema is in place.
  const count = db.prepare("SELECT COUNT(*) AS n FROM issues").get().n;
  console.log(`Database ready — issues table has ${count} row(s).`);
});
