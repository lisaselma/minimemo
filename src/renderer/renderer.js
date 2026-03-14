const { invoke } = window.__TAURI__.core;
const { getCurrentWebviewWindow } = window.__TAURI__.webviewWindow;
const windowApi = window.__TAURI__.window || {};
const getCurrentWindow = windowApi.getCurrent || (() => getCurrentWebviewWindow());

// ── DOM refs ───────────────────────────────────────────────────────────────────
const note            = document.getElementById("note");
const newNoteBtn      = document.getElementById("new-note");
const colorPicker     = document.getElementById("color-picker");
const opacitySlider   = document.getElementById("opacity-slider");
const settingsToggle  = document.getElementById("settings-toggle");
const closeNoteBtn    = document.getElementById("close-note");
const settingsPanel   = document.getElementById("settings-panel");
const fontColorPicker = document.getElementById("font-color-picker");
const fontFamilyPicker= document.getElementById("font-family-picker");
const fontSizePicker  = document.getElementById("font-size-picker");
const insertBulletBtn = document.getElementById("insert-bullet-list");
const insertNumberBtn = document.getElementById("insert-numbered-list");
const insertCheckBtn  = document.getElementById("insert-checklist");
const overviewBtn     = document.getElementById("overview-btn");
const noteTitleEl     = document.getElementById("note-title");

const noteId = getCurrentWebviewWindow().label || "default";

const LEGACY_COLOR_MAP = {
  purple: "#c8b4ff", yellow: "#fffcb4", blue: "#b4dcff",
  green: "#c3f5c8", pink: "#ffc8e6",
};

const DEFAULT_COLOR   = "#ffffff";
const DEFAULT_OPACITY = 0.92;

// ── Color helpers ──────────────────────────────────────────────────────────────
function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return { r: 255, g: 255, b: 255 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function applyColorAndOpacity(colorHex, opacity) {
  const { r, g, b } = hexToRgb(colorHex);
  let a = Number(opacity);
  if (!Number.isFinite(a) || a < 0.3 || a > 1) a = DEFAULT_OPACITY;
  document.body.style.setProperty("--note-bg", `rgba(${r},${g},${b},${a})`);
}

// ── Font helpers ───────────────────────────────────────────────────────────────
function applyFont(fontFamily, fontSize) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !note.contains(sel.anchorNode)) {
    note.style.fontFamily = fontFamily;
    note.style.fontSize = fontSize + "px";
  } else {
    try {
      const range = sel.getRangeAt(0);
      const span = document.createElement("span");
      span.style.fontFamily = fontFamily;
      span.style.fontSize = fontSize + "px";
      span.appendChild(range.extractContents());
      range.insertNode(span);
      sel.removeAllRanges();
      const nr = document.createRange();
      nr.selectNodeContents(span);
      sel.addRange(nr);
    } catch (_) {
      note.style.fontFamily = fontFamily;
      note.style.fontSize = fontSize + "px";
    }
  }
  saveCurrentNote();
}

function applyTextColor(colorHex) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !note.contains(sel.anchorNode)) {
    note.style.color = colorHex;
  } else {
    try {
      const range = sel.getRangeAt(0);
      const span = document.createElement("span");
      span.style.color = colorHex;
      span.appendChild(range.extractContents());
      range.insertNode(span);
      sel.removeAllRanges();
      const nr = document.createRange();
      nr.selectNodeContents(span);
      sel.addRange(nr);
    } catch (_) {
      note.style.color = colorHex;
    }
  }
  saveCurrentNote();
}

// ── List helpers ───────────────────────────────────────────────────────────────
function insertList(type) {
  note.focus();
  document.execCommand(type === "bullet" ? "insertUnorderedList" : "insertOrderedList", false, null);
  saveCurrentNote();
}

function insertChecklist() {
  note.focus();
  const sel = window.getSelection();
  let range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
  if (!range || !note.contains(sel.anchorNode)) {
    range = document.createRange();
    range.selectNodeContents(note);
    range.collapse(true);
    if (sel) { sel.removeAllRanges(); sel.addRange(range); }
  }
  const box = document.createElement("span");
  box.className = "checklist-box";
  box.contentEditable = "false";
  box.textContent = "☐";
  box.dataset.checked = "false";
  range.insertNode(box);
  const sp = document.createTextNode("\u00A0");
  range.setStartAfter(box);
  range.insertNode(sp);
  range.setStartAfter(sp);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  saveCurrentNote();
}

function toggleCheckBox(box) {
  const checked = box.dataset.checked === "true";
  box.textContent = checked ? "☐" : "☑";
  box.dataset.checked = checked ? "false" : "true";
  saveCurrentNote();
}

function getBlockAncestor(node) {
  let n = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
  while (n && n !== note) {
    const t = n.tagName?.toLowerCase();
    if (t === "div" || t === "p" || t === "li") return n;
    n = n.parentElement;
  }
  return null;
}

function isInsideLi(sel) {
  if (!sel || sel.rangeCount === 0) return null;
  let n = sel.anchorNode;
  while (n && n !== note) {
    if (n.nodeType === Node.ELEMENT_NODE) {
      const t = n.tagName.toLowerCase();
      if (t === "li") return n;
      if (t === "ul" || t === "ol") return null;
    }
    n = n.parentNode;
  }
  return null;
}

function handleEnterInList(e) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  if (!note.contains(range.startContainer)) return false;

  const li = isInsideLi(sel);
  if (li) {
    e.preventDefault();
    const newLi = document.createElement("li");
    li.parentNode.insertBefore(newLi, li.nextSibling);
    newLi.appendChild(document.createElement("br"));
    range.setStart(newLi, 0); range.setEnd(newLi, 0);
    sel.removeAllRanges(); sel.addRange(range);
    saveCurrentNote();
    return true;
  }

  const block = getBlockAncestor(range.startContainer);
  if (block && block.querySelector(".checklist-box")) {
    e.preventDefault();
    const newBlock = document.createElement("div");
    const span = document.createElement("span");
    span.className = "checklist-box"; span.contentEditable = "false";
    span.textContent = "☐"; span.dataset.checked = "false";
    const sp = document.createTextNode("\u00A0");
    newBlock.appendChild(span); newBlock.appendChild(sp);
    block.nextSibling ? note.insertBefore(newBlock, block.nextSibling) : note.appendChild(newBlock);
    range.setStart(sp, 1); range.setEnd(sp, 1);
    sel.removeAllRanges(); sel.addRange(range);
    saveCurrentNote();
    return true;
  }
  return false;
}

// ── Save / restore ─────────────────────────────────────────────────────────────
async function saveCurrentNote() {
  const colorHex = colorPicker.value || DEFAULT_COLOR;
  const raw = parseFloat(opacitySlider.value);
  const opacity = Number.isFinite(raw) ? Math.max(0.3, Math.min(1, 1.3 - raw)) : DEFAULT_OPACITY;

  await invoke("save_note", {
    id: noteId,
    data: {
      content: note.innerHTML,
      color: colorHex,
      opacity: Math.max(0.3, Math.min(1, opacity)),
      font_color: fontColorPicker?.value ?? "#000000",
      font_family: fontFamilyPicker?.value ?? "system-ui",
      font_size: fontSizePicker?.value ?? "14",
    },
  });
}

async function restore() {
  const current = await invoke("load_note", { id: noteId });
  const isNew = !current || (!current.content && !current.color);

  let color = current?.color;
  let opacity = parseFloat(current?.opacity);
  if (isNew || !Number.isFinite(opacity) || opacity < 0.3 || opacity > 1) opacity = DEFAULT_OPACITY;

  if (color && LEGACY_COLOR_MAP[color]) color = LEGACY_COLOR_MAP[color];
  if (isNew || !color || !/^#([0-9a-fA-F]{6})$/.test(color)) color = DEFAULT_COLOR;

  const fontColor  = current?.font_color  || "#000000";
  const fontFamily = current?.font_family || "system-ui";
  const fontSize   = current?.font_size   || "14";
  const title      = current?.title       || "minimemo";

  if (current?.content) note.innerHTML = current.content;

  note.querySelectorAll(".checklist-box").forEach((b) => {
    b.dataset.checked = b.textContent.trim() === "☑" ? "true" : "false";
  });

  colorPicker.value  = color;
  const sliderVal    = 1.3 - opacity;
  opacitySlider.value = String(Math.max(0.3, Math.min(1, sliderVal)));
  if (fontColorPicker)  fontColorPicker.value  = fontColor;
  if (fontFamilyPicker) fontFamilyPicker.value = fontFamily;
  if (fontSizePicker)   fontSizePicker.value   = fontSize;

  applyColorAndOpacity(color, opacity);
  note.style.color      = fontColor;
  note.style.fontFamily = fontFamily;
  note.style.fontSize   = fontSize + "px";

  if (noteTitleEl) noteTitleEl.textContent = title;
}

// ── Event wiring ───────────────────────────────────────────────────────────────
function attachEvents() {
  note.oninput = () => saveCurrentNote();

  note.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleEnterInList(e);
  });

  note.addEventListener("click", (e) => {
    const box = e.target.classList?.contains("checklist-box") ? e.target : null;
    if (box) { e.preventDefault(); toggleCheckBox(box); }
  });

  colorPicker.onchange = () => {
    const raw = parseFloat(opacitySlider.value);
    const a = Number.isFinite(raw) ? Math.max(0.3, Math.min(1, 1.3 - raw)) : DEFAULT_OPACITY;
    applyColorAndOpacity(colorPicker.value, a);
    saveCurrentNote();
  };

  opacitySlider.oninput = () => {
    const raw = parseFloat(opacitySlider.value);
    const a = Number.isFinite(raw) ? Math.max(0.3, Math.min(1, 1.3 - raw)) : DEFAULT_OPACITY;
    applyColorAndOpacity(colorPicker.value, a);
    saveCurrentNote();
  };

  if (fontColorPicker)  fontColorPicker.oninput  = () => applyTextColor(fontColorPicker.value);
  if (fontFamilyPicker) fontFamilyPicker.onchange = () => applyFont(fontFamilyPicker.value, fontSizePicker?.value ?? "14");
  if (fontSizePicker)   fontSizePicker.onchange   = () => applyFont(fontFamilyPicker?.value ?? "system-ui", fontSizePicker.value);

  if (insertBulletBtn) insertBulletBtn.onclick = () => insertList("bullet");
  if (insertNumberBtn) insertNumberBtn.onclick = () => insertList("numbered");
  if (insertCheckBtn)  insertCheckBtn.onclick  = () => insertChecklist();

  // Settings panel toggle
  settingsToggle.onclick = () => settingsPanel.classList.toggle("open");

  settingsPanel.addEventListener("click", (e) => {
    const toggle = e.target.closest(".settings-section-toggle");
    if (!toggle) return;
    const section = toggle.closest(".settings-section");
    if (!section) return;
    section.classList.toggle("collapsed");
    toggle.setAttribute("aria-expanded", String(!section.classList.contains("collapsed")));
  });

  // Close button
  closeNoteBtn.onclick = () => {
    const win = getCurrentWindow();
    if (win?.close) win.close();
  };

  // New note
  newNoteBtn.onclick = () => invoke("create_new_note");

  // Overview button — short click: open overview; long press (≥600ms): insert 🐑 into note
  if (overviewBtn) {
    let sheepTimer = null;
    let sheepFired = false;

    overviewBtn.title = "Overview (hold for 🐑)";

    overviewBtn.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      sheepFired = false;
      sheepTimer = setTimeout(() => {
        sheepFired = true;
        note.focus();
        document.execCommand("insertText", false, "🐑");
        saveCurrentNote();
        // Bounce the button
        overviewBtn.style.transition = "transform 0.15s ease";
        overviewBtn.style.transform  = "scale(1.4)";
        setTimeout(() => { overviewBtn.style.transform = "scale(1)"; }, 150);
        setTimeout(() => { overviewBtn.style.transition = ""; overviewBtn.style.transform = ""; }, 320);
      }, 600);
    }, true);

    const cancelSheep = () => clearTimeout(sheepTimer);
    overviewBtn.addEventListener("mouseup",    cancelSheep, true);
    overviewBtn.addEventListener("mouseleave", cancelSheep);

    overviewBtn.onclick = () => {
      if (sheepFired) { sheepFired = false; return; }
      invoke("open_overview");
    };
  }

  // Inline rename in toolbar
  if (noteTitleEl) {
    noteTitleEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); noteTitleEl.blur(); }
      if (e.key === "Escape") { noteTitleEl.blur(); }
    });
    noteTitleEl.addEventListener("blur", async () => {
      const newTitle = noteTitleEl.textContent.trim() || "minimemo";
      noteTitleEl.textContent = newTitle;
      await invoke("rename_note", { id: noteId, title: newTitle });
    });
    // Prevent drag from firing when clicking on title
    noteTitleEl.addEventListener("mousedown", (e) => e.stopPropagation());
  }

  // Keyboard shortcuts (only when note isn't focused)
  window.addEventListener("keydown", (e) => {
    const typing = document.activeElement === note || note.contains(document.activeElement);
    if (typing) return;
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "n") {
      e.preventDefault();
      invoke("create_new_note");
    }
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key === ",") {
      e.preventDefault();
      settingsPanel.classList.add("open");
    }
  });
}

// ── Init ───────────────────────────────────────────────────────────────────────
(async () => {
  await restore();
  attachEvents();
})();
