// db.js — SQLite connection + schema initialization. Opens the database file,
// ensures the `issues` table exists, and hands back a single shared connection
// for the routes to use.
//
// We use better-sqlite3, which is synchronous (calls return results directly
// instead of via callbacks/promises) — simpler, more readable data code.

const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

// Resolve paths relative to THIS file (server/db.js), not to the directory the
// process happens to be started from. That way `npm start` works no matter the
// current working directory. The db/ folder is one level up from server/.
const dbPath = process.env.DB_PATH || path.join(__dirname, "..", "db", "issues.db");
const schemaPath = path.join(__dirname, "..", "db", "schema.sql");

// better-sqlite3 creates the file automatically if it does not exist yet, so first
// run produces a fresh, empty db/issues.db.
const db = new Database(dbPath);

// Apply the schema. schema.sql is the single source of truth for the table
// definition. It uses "CREATE TABLE IF NOT EXISTS", so running this on every startup
// is harmless — creates the table the first time, a no-op afterwards.
const schemaSql = fs.readFileSync(schemaPath, "utf8");
db.exec(schemaSql);

// Export the one shared connection for the routes to use.
module.exports = db;
