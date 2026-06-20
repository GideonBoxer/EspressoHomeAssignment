// app.js — the browser-side logic for The Trial Issue Log.
//
// This file runs in the BROWSER (not Node). It talks to the same-origin JSON API
// under /api using fetch(), and builds the page by hand with DOM calls — no
// framework, no build step. It is organised top-to-bottom as:
//
//   1. small shared helpers (element lookup, API calls, the notice banner)
//   2. the issues list (load + render + the action buttons)
//   3. the search / filter controls
//   4. the Create/Edit modal
//   5. the Delete confirmation modal
//   6. the CSV upload
//   7. sidebar navigation
//   8. startup wiring
//
// Everything runs after the page's HTML has loaded (see the DOMContentLoaded
// listener at the very bottom), so all the elements it looks up already exist.

// ============================ 1. Shared helpers ============================

// Short alias for document.getElementById — used a lot below, so a tiny helper
// keeps the rest of the file readable.
function byId(id) {
  return document.getElementById(id);
}

// Call the JSON API and return the parsed body. On a non-2xx response we throw an
// Error carrying the API's { error } message, so callers can show it to the user
// with a simple try/catch. `options` is passed straight to fetch (method, body…).
//
// A 204 (No Content, used by DELETE) has no body to parse, so we return null.
async function apiRequest(url, options) {
  const response = await fetch(url, options);

  if (response.status === 204) {
    return null;
  }

  // Every endpoint we call returns JSON (a result on success, { error } on
  // failure). Parse it once, then branch on whether the request succeeded.
  const data = await response.json();

  if (!response.ok) {
    // The API's error format is { "error": "<message>" }. Fall back to a generic
    // message just in case a response is shaped differently.
    const message = data && data.error ? data.error : "Request failed";
    throw new Error(message);
  }

  return data;
}

// Show a message in the inline banner at the top of the page. `kind` is "success"
// or "error" and picks the colour. Used for import results and unexpected errors.
function showNotice(message, kind) {
  const notice = byId("notice");
  notice.textContent = message;
  notice.className = "notice is-" + kind; // resets any previous kind class
  notice.hidden = false;
}

function hideNotice() {
  byId("notice").hidden = true;
}

// Turn an ISO-8601 timestamp (e.g. "2025-05-01T09:00:00Z") into something readable
// in the user's own locale/timezone. The raw value is what the API stores; this is
// purely for display in the table.
function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString();
}

// ============================ 2. Issues list ============================

// The current filter state, mirrored from the controls. loadIssues() reads this to
// build the query string, so any control can update one field and re-load.
const filters = {
  search: "",
  status: "",
  severity: "",
};

// Fetch the issues that match the current filters and render them. Called on
// startup and after every change (typing, filtering, create/edit/resolve/delete,
// import). Only non-empty filters are added to the query string; the API treats an
// absent param as "no filter".
async function loadIssues() {
  const params = new URLSearchParams();
  if (filters.search !== "") {
    params.set("search", filters.search);
  }
  if (filters.status !== "") {
    params.set("status", filters.status);
  }
  if (filters.severity !== "") {
    params.set("severity", filters.severity);
  }

  const queryString = params.toString();
  const url = queryString === "" ? "/api/issues" : "/api/issues?" + queryString;

  try {
    const issues = await apiRequest(url);
    renderIssues(issues);
  } catch (err) {
    showNotice("Could not load issues: " + err.message, "error");
  }
}

// Build the table body from an array of issues. We clear the old rows and rebuild
// from scratch each time — simplest correct approach at this app's size (a handful
// of rows), and avoids any diffing logic.
function renderIssues(issues) {
  const tbody = byId("issues-tbody");

  // Hide the hover tooltip before rebuilding. If a row was hovered when the list
  // re-rendered (e.g. just after a resolve/delete), its mouseleave might not fire,
  // so we clear the tooltip here to be safe.
  hideTooltip();

  tbody.replaceChildren(); // clear previous rows

  // Show a friendly empty-state line instead of a blank table.
  byId("empty-issues").hidden = issues.length > 0;

  for (const issue of issues) {
    tbody.appendChild(buildRow(issue));
  }
}

// ---- Row description tooltip ----
// One shared tooltip element (see index.html) reused for every row. We show it on
// hover with the row's description, follow the cursor while moving, and hide it on
// leave. Kept in its own little group of functions so buildRow just wires the events.

// Show the tooltip with `text` and position it for a cursor at (mouseX, mouseY).
function showTooltip(text, mouseX, mouseY) {
  const tooltip = byId("row-tooltip");
  tooltip.textContent = text;
  tooltip.hidden = false;
  positionTooltip(mouseX, mouseY);
}

// Place the tooltip near the cursor, nudged down-and-right. If that would push it off
// the right or bottom edge of the window, flip it to the other side of the cursor so
// it always stays fully visible. Uses fixed (viewport) coordinates, which is why the
// CSS sets position: fixed.
function positionTooltip(mouseX, mouseY) {
  const tooltip = byId("row-tooltip");
  const offset = 14; // gap between the cursor and the tooltip
  const width = tooltip.offsetWidth;
  const height = tooltip.offsetHeight;

  let left = mouseX + offset;
  let top = mouseY + offset;

  // Flip left if it would overflow the right edge.
  if (left + width > window.innerWidth) {
    left = mouseX - offset - width;
  }
  // Flip above if it would overflow the bottom edge.
  if (top + height > window.innerHeight) {
    top = mouseY - offset - height;
  }

  tooltip.style.left = left + "px";
  tooltip.style.top = top + "px";
}

function hideTooltip() {
  byId("row-tooltip").hidden = true;
}

// Build one <tr> for a single issue, including its action buttons. Kept as its own
// function so renderIssues stays a short loop and the row layout is easy to find.
function buildRow(issue) {
  const tr = document.createElement("tr");

  // Hover tooltip showing this issue's full description. The description already
  // comes back with the list (GET /api/issues), so no extra request is needed. We
  // only wire the tooltip when there is text to show.
  if (issue.description) {
    tr.addEventListener("mouseenter", (event) =>
      showTooltip(issue.description, event.clientX, event.clientY)
    );
    tr.addEventListener("mousemove", (event) =>
      positionTooltip(event.clientX, event.clientY)
    );
    tr.addEventListener("mouseleave", hideTooltip);
  }

  // Plain text cells. textContent (not innerHTML) means a title like "<b>" shows
  // literally and can never inject HTML — safe by construction.
  tr.appendChild(textCell(issue.title));
  tr.appendChild(textCell(issue.site || "—")); // site is optional; show a dash
  tr.appendChild(badgeCell(issue.severity, "badge-" + issue.severity));
  tr.appendChild(badgeCell(formatStatus(issue.status), "badge-" + issue.status));
  tr.appendChild(textCell(formatDate(issue.createdAt)));

  // Actions cell: Edit, Resolve, Delete.
  const actions = document.createElement("td");
  actions.className = "actions-col";
  const wrap = document.createElement("div");
  wrap.className = "row-actions";

  // Edit — opens the modal pre-filled with this issue.
  const editBtn = document.createElement("button");
  editBtn.className = "btn-row";
  editBtn.textContent = "Edit";
  editBtn.addEventListener("click", () => openEditDialog(issue));
  wrap.appendChild(editBtn);

  // Resolve — flips status to "resolved". Disabled when already resolved, since
  // there would be nothing to do.
  const resolveBtn = document.createElement("button");
  resolveBtn.className = "btn-row resolve";
  resolveBtn.textContent = "Resolve";
  if (issue.status === "resolved") {
    resolveBtn.disabled = true;
  } else {
    resolveBtn.addEventListener("click", () => resolveIssue(issue.id));
  }
  wrap.appendChild(resolveBtn);

  // Delete — opens the confirmation modal first.
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "btn-row delete";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", () => openDeleteDialog(issue));
  wrap.appendChild(deleteBtn);

  actions.appendChild(wrap);
  tr.appendChild(actions);

  return tr;
}

// Helper: a <td> containing plain text.
function textCell(value) {
  const td = document.createElement("td");
  td.textContent = value;
  return td;
}

// Helper: a <td> containing a coloured pill (severity / status).
function badgeCell(label, className) {
  const td = document.createElement("td");
  const span = document.createElement("span");
  span.className = "badge " + className;
  span.textContent = label;
  td.appendChild(span);
  return td;
}

// "in_progress" reads better as "in progress" in the UI.
function formatStatus(status) {
  return status === "in_progress" ? "in progress" : status;
}

// Resolve one issue: a partial update that only changes the status. After it
// succeeds we reload so the row reflects the new status (and the Resolve button
// becomes disabled).
async function resolveIssue(id) {
  try {
    await apiRequest("/api/issues/" + id, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "resolved" }),
    });
    hideNotice();
    await loadIssues();
  } catch (err) {
    showNotice("Could not resolve issue: " + err.message, "error");
  }
}

// ============================ 3. Search / filter controls ============================

// Debounce: return a wrapped version of `fn` that only runs after the user has
// stopped calling it for `delay` ms. Used on the search box so we fire one request
// after a pause in typing, not one per keystroke.
function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function wireControls() {
  // Search box: update the filter and reload, debounced ~250ms.
  const runSearch = debounce(() => {
    filters.search = byId("search-input").value.trim();
    loadIssues();
  }, 250);
  byId("search-input").addEventListener("input", runSearch);

  // Dropdowns: reload immediately on change (no debounce needed for a single click).
  byId("status-filter").addEventListener("change", (event) => {
    filters.status = event.target.value;
    loadIssues();
  });
  byId("severity-filter").addEventListener("change", (event) => {
    filters.severity = event.target.value;
    loadIssues();
  });
}

// ============================ 4. Create / Edit modal ============================

// Open the modal in "create" mode: empty fields, sensible enum defaults, and an
// empty hidden id so submit knows to POST. We clear any leftover error first.
function openCreateDialog() {
  byId("issue-dialog-title").textContent = "Create issue";
  byId("issue-id").value = "";
  byId("field-title").value = "";
  byId("field-description").value = "";
  byId("field-site").value = "";
  byId("field-severity").value = "minor";
  byId("field-status").value = "open";
  clearFormError();
  byId("issue-dialog").showModal();
}

// Open the modal in "edit" mode: pre-fill from the issue and stash its id so submit
// knows to PUT.
function openEditDialog(issue) {
  byId("issue-dialog-title").textContent = "Edit issue";
  byId("issue-id").value = issue.id;
  byId("field-title").value = issue.title;
  byId("field-description").value = issue.description;
  byId("field-site").value = issue.site || "";
  byId("field-severity").value = issue.severity;
  byId("field-status").value = issue.status;
  clearFormError();
  byId("issue-dialog").showModal();
}

function clearFormError() {
  const error = byId("issue-form-error");
  error.hidden = true;
  error.textContent = "";
}

function showFormError(message) {
  const error = byId("issue-form-error");
  error.textContent = message;
  error.hidden = false;
}

// Handle the modal form submit for BOTH create and edit. The hidden id field tells
// the two apart: empty → POST a new issue, present → PUT an update to that id.
async function submitIssueForm(event) {
  // The form is method="dialog", which would close the modal on submit. We take
  // over instead so we can call the API and keep the modal open on a validation
  // error.
  event.preventDefault();

  const id = byId("issue-id").value;
  const payload = {
    title: byId("field-title").value,
    description: byId("field-description").value,
    site: byId("field-site").value,
    severity: byId("field-severity").value,
    status: byId("field-status").value,
  };

  // Choose POST (create) vs PUT (edit) from whether we have an id.
  const isEdit = id !== "";
  const url = isEdit ? "/api/issues/" + id : "/api/issues";
  const method = isEdit ? "PUT" : "POST";

  try {
    await apiRequest(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    byId("issue-dialog").close();
    hideNotice();
    await loadIssues();
  } catch (err) {
    // Keep the modal open and show the API's validation message inline, so the
    // user can fix the field without losing what they typed.
    showFormError(err.message);
  }
}

function wireIssueDialog() {
  byId("create-issue-btn").addEventListener("click", openCreateDialog);
  byId("issue-form").addEventListener("submit", submitIssueForm);
  byId("issue-cancel-btn").addEventListener("click", () => {
    byId("issue-dialog").close();
  });
}

// ============================ 5. Delete confirmation modal ============================

// Remember which issue the open delete dialog refers to, so the Delete button knows
// what to remove when clicked. Set when the dialog opens, cleared when it closes.
let pendingDeleteId = null;

function openDeleteDialog(issue) {
  pendingDeleteId = issue.id;
  byId("delete-dialog").showModal();
}

async function confirmDelete() {
  if (pendingDeleteId === null) {
    return;
  }
  try {
    await apiRequest("/api/issues/" + pendingDeleteId, { method: "DELETE" });
    byId("delete-dialog").close();
    pendingDeleteId = null;
    hideNotice();
    await loadIssues();
  } catch (err) {
    byId("delete-dialog").close();
    pendingDeleteId = null;
    showNotice("Could not delete issue: " + err.message, "error");
  }
}

function wireDeleteDialog() {
  byId("delete-confirm-btn").addEventListener("click", confirmDelete);
  byId("delete-cancel-btn").addEventListener("click", () => {
    byId("delete-dialog").close();
    pendingDeleteId = null;
  });
}

// ============================ 6. CSV upload ============================

function wireCsvUpload() {
  const fileInput = byId("csv-file-input");

  // The visible button just forwards its click to the hidden file <input>, so we
  // get a native file picker without showing the default (ugly) file control.
  byId("upload-csv-btn").addEventListener("click", () => fileInput.click());

  // When the user picks a file, read its text and POST it to the import endpoint.
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) {
      return;
    }

    try {
      const csvText = await file.text();
      const result = await apiRequest("/api/import", {
        method: "POST",
        headers: { "Content-Type": "text/csv" },
        body: csvText,
      });
      showNotice("Imported " + result.imported + " issue(s).", "success");
      await loadIssues();
    } catch (err) {
      // Import is all-or-nothing on the server, so on error nothing changed.
      showNotice("Import failed: " + err.message, "error");
    }

    // Reset the input so picking the SAME file again still fires a change event.
    fileInput.value = "";
  });
}

// ============================ 7. Sidebar navigation ============================

// Switch the visible page by toggling the is-active class on the matching nav
// button and <section>. data-page on each nav button names its target section id
// (e.g. "issues" → #page-issues).
function wireNavigation() {
  const navButtons = document.querySelectorAll(".nav-item");

  navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const page = button.dataset.page;

      // Highlight the clicked nav item, un-highlight the others.
      navButtons.forEach((other) => {
        other.classList.toggle("is-active", other === button);
      });

      // Show the matching section, hide the rest.
      document.querySelectorAll(".page").forEach((section) => {
        section.classList.toggle("is-active", section.id === "page-" + page);
      });
    });
  });
}

// ============================ 8. Startup ============================

// Wire up every control once, then load the initial list. Runs after the HTML is
// parsed so all the elements exist.
document.addEventListener("DOMContentLoaded", () => {
  wireControls();
  wireIssueDialog();
  wireDeleteDialog();
  wireCsvUpload();
  wireNavigation();
  loadIssues();
});
