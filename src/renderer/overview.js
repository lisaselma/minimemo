const { invoke } = window.__TAURI__.core;

const noteList = document.getElementById("note-list");
const footer   = document.getElementById("footer");

// ── Helpers ────────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderRow(n) {
  const hidden = !n.visible;
  return `
    <div class="note-row ${hidden ? "hidden-note" : ""}"
         data-label="${escHtml(n.label)}"
         data-visible="${n.visible}">
      <span class="dot" title="${hidden ? "hidden" : "on desktop"}"></span>
      <span
        class="note-title-field"
        contenteditable="true"
        spellcheck="false"
        data-original="${escHtml(n.title)}"
        title="${hidden ? "hidden — click to open" : "click to focus memo"}"
      >${escHtml(n.title)}</span>
      <button type="button" class="action-btn danger" data-action="delete" title="Delete memo">&#215;</button>
    </div>`;
}

// ── Load and render ────────────────────────────────────────────────────────────

async function loadNotes() {
  const notes = await invoke("get_notes_info");

  if (!notes.length) {
    noteList.innerHTML = '<p class="empty-msg">No memos yet —<br>click + New to create one</p>';
    footer.textContent = "0 memos";
    return;
  }

  footer.textContent = `${notes.length} memo${notes.length !== 1 ? "s" : ""}`;
  noteList.innerHTML = notes.map(renderRow).join("");

  noteList.querySelectorAll(".note-title-field").forEach((field) => {
    field.addEventListener("blur",    () => commitRename(field));
    field.addEventListener("keydown", (e) => {
      if (e.key === "Enter")  { e.preventDefault(); field.blur(); }
      if (e.key === "Escape") { field.textContent = field.dataset.original; field.blur(); }
    });
  });
}

async function commitRename(field) {
  const newTitle = field.textContent.trim();
  if (!newTitle) { field.textContent = field.dataset.original || "minimemo"; return; }
  if (newTitle === field.dataset.original) return;
  field.dataset.original = newTitle;
  const row = field.closest(".note-row");
  if (row) await invoke("rename_note", { id: row.dataset.label, title: newTitle });
}

// ── Row interactions: open / focus / delete ────────────────────────────────────

noteList.addEventListener("click", async (e) => {
  const delBtn = e.target.closest("[data-action=\"delete\"]");
  if (delBtn) {
    const row = delBtn.closest(".note-row");
    if (!row) return;
    const label = row.dataset.label;
    const title = row.querySelector(".note-title-field")?.textContent?.trim() || label;
    if (confirm(`Delete "${title}"? This cannot be undone.`)) {
      await invoke("delete_note", { label });
      await loadNotes();
    }
    return;
  }

  const row = e.target.closest(".note-row");
  if (!row) return;
  const label = row.dataset.label;
  const visible = row.dataset.visible === "true";

  if (e.target.closest(".note-title-field")) {
    if (visible) {
      await invoke("focus_note", { label });
    } else {
      await invoke("toggle_note_visibility", { label });
      await loadNotes();
    }
    return;
  }

  if (!visible) {
    await invoke("toggle_note_visibility", { label });
    await loadNotes();
  } else {
    await invoke("focus_note", { label });
  }
});

// ── New memo button ────────────────────────────────────────────────────────────

document.getElementById("new-note-btn").addEventListener("click", async () => {
  await invoke("create_new_note");
  setTimeout(loadNotes, 400);
});

// ── Initial load + refresh on focus ───────────────────────────────────────────

loadNotes();
window.addEventListener("focus", loadNotes);
