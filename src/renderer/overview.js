const { invoke } = window.__TAURI__.core;

// ── Load and render note list ──────────────────────────────────────────────────

async function loadNotes() {
  const notes = await invoke("get_notes_info");
  const list = document.getElementById("note-list");
  const footer = document.getElementById("footer");

  if (!notes.length) {
    list.innerHTML = '<p class="empty-msg">No memos yet — click + New memo to start</p>';
    footer.textContent = "0 memos";
    return;
  }

  footer.textContent = `${notes.length} memo${notes.length === 1 ? "" : "s"}`;

  list.innerHTML = notes
    .map((n) => renderRow(n))
    .join("");

  // Attach events after rendering
  notes.forEach((n) => {
    const row = document.querySelector(`.note-row[data-label="${CSS.escape(n.label)}"]`);
    if (!row) return;

    const titleField = row.querySelector(".note-title-field");
    const visBtn = row.querySelector(".btn-visibility");
    const delBtn = row.querySelector(".btn-delete");

    // Focus note on title click (only when visible)
    titleField.addEventListener("click", () => {
      if (n.visible) invoke("focus_note", { label: n.label });
    });

    // Rename on blur / Enter
    titleField.addEventListener("blur", () => commitRename(n.label, titleField));
    titleField.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); titleField.blur(); }
      if (e.key === "Escape") { titleField.textContent = n.title; titleField.blur(); }
    });

    // Toggle visibility
    visBtn.addEventListener("click", async () => {
      await invoke("toggle_note_visibility", { label: n.label });
      await loadNotes();
    });

    // Delete with confirmation
    delBtn.addEventListener("click", async () => {
      if (confirm(`Delete "${n.title}"? This cannot be undone.`)) {
        await invoke("delete_note", { label: n.label });
        await loadNotes();
      }
    });
  });
}

function renderRow(n) {
  const hidden = !n.visible;
  // 👁 = show on desktop (currently hidden), 🙈 = hide from desktop (currently visible)
  const visIcon = hidden ? "&#128065;" : "&#128584;";
  const visTitle = hidden ? "Show on desktop" : "Hide from desktop";

  return `
    <div class="note-row ${hidden ? "hidden-note" : ""}" data-label="${escHtml(n.label)}">
      <span class="dot" title="${hidden ? "hidden" : "visible on desktop"}"></span>
      <span
        class="note-title-field"
        contenteditable="true"
        spellcheck="false"
        data-visible="${n.visible}"
        data-original="${escHtml(n.title)}"
        title="${hidden ? "hidden" : "click to open"}"
      >${escHtml(n.title)}</span>
      <button class="action-btn btn-visibility" title="${visTitle}">${visIcon}</button>
      <button class="action-btn danger btn-delete" title="Delete memo">&#128465;</button>
    </div>`;
}

async function commitRename(label, el) {
  const newTitle = el.textContent.trim();
  if (!newTitle) { el.textContent = el.dataset.original || "Untitled"; return; }
  if (newTitle === el.dataset.original) return;
  el.dataset.original = newTitle;
  await invoke("rename_note", { id: label, title: newTitle });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── New note button ────────────────────────────────────────────────────────────

document.getElementById("new-note-btn").addEventListener("click", async () => {
  await invoke("create_new_note");
  setTimeout(loadNotes, 400);
});

// ── Initial load + refresh on focus ───────────────────────────────────────────
loadNotes();
window.addEventListener("focus", loadNotes);
