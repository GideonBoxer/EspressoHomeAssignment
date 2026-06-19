// db.js — SQLite connection + schema initialization.
//
// This file has one job: open the SQLite database file and make sure the
// `issues` table exists, then hand back a single shared connection that the
// rest of the app (the routes) will use.
//
// We use better-sqlite3, which is synchronous (its calls return results
// directly instead of via callbacks/promises). That keeps the data code simple
// and easy to read, which is exactly what we want here.

const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

// Resolve paths relative to THIS file (server/db.js), not to the directory the
// process happens to be started from. That way `npm start` works no matter the
// current working directory. The db/ folder is one level up from server/.
const dbPath = process.env.DB_PATH || path.join(__dirname, "..", "db", "issues.db");
const schemaPath = path.join(__dirname, "..", "db", "schema.sql");

// Open the database. better-sqlite3 creates the file automatically if it does
// not exist yet, so first run produces a fresh, empty db/issues.db.
const db = new Database(dbPath);

// Apply the schema. schema.sql is the single source of truth for the table
// definition; we read it and execute it here rather than duplicating the DDL in
// code. The statement is "CREATE TABLE IF NOT EXISTS", so running this on every
// startup is harmless — it creates the table the first time and is a no-op
// afterwards, never touching existing data.
const schemaSql = fs.readFileSync(schemaPath, "utf8");
db.exec(schemaSql);

// Export the one shared connection for the routes to use.
module.exports = db;
