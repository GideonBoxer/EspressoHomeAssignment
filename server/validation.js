// validation.js — shared input-validation helpers for the /api routes.
//
// The route files used to inline their own validation, which meant the same two
// checks (non-empty string, enum membership) and the enum value lists were copied
// into every handler. Pulling them here keeps the routes short and — just as
// important — makes every endpoint phrase its 400 errors the same way.
//
// Convention used by every helper below: return an ERROR MESSAGE STRING when the
// value is invalid, or `null` when it is fine. The caller decides what to do with
// a non-null result (in our routes: `return res.status(400).json({ error })`).
// Returning a plain string (rather than throwing) keeps the routes a simple,
// readable "check, then bail" sequence with no try/catch.

// The allowed enum values, straight from the API contract. Kept as plain arrays
// so we can both check membership and build a helpful "must be one of ..." error.
const STATUSES = ["open", "in_progress", "resolved"];
const SEVERITIES = ["minor", "major", "critical"];

// requireNonEmptyString — for fields that are always required (e.g. title,
// description). A value is only acceptable if it is a string with at least one
// non-whitespace character, so "   " does NOT count as a real value.
function requireNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    return `${fieldName} is required and must be a non-empty string`;
  }
  return null;
}

// validateEnum — for fields whose value must be one of a fixed list (status,
// severity). `undefined` is treated as VALID: these fields are optional on the
// query string and optional-with-a-default on create, so "absent" is fine and the
// caller can apply its default afterwards. Only a present-but-unknown value fails.
function validateEnum(value, allowed, fieldName) {
  if (value === undefined) {
    return null;
  }
  if (!allowed.includes(value)) {
    return `Invalid ${fieldName}: must be one of ${allowed.join(", ")}`;
  }
  return null;
}

module.exports = {
  STATUSES,
  SEVERITIES,
  requireNonEmptyString,
  validateEnum,
};
