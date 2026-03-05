const { ipcRenderer } = require("electron")
const fs = require("fs")
const path = require("path")

const note = document.getElementById("note")
const newNoteBtn = document.getElementById("new-note")
const colorPicker = document.getElementById("color-picker")
const opacitySlider = document.getElementById("opacity-slider")
const settingsToggle = document.getElementById("settings-toggle")
const closeNoteBtn = document.getElementById("close-note")
const settingsPanel = document.getElementById("settings-panel")
const fontColorPicker = document.getElementById("font-color-picker")

const urlParams = new URLSearchParams(window.location.search)
const noteId = urlParams.get("id") || "default"

const STORE_DIR = path.join(__dirname, "..", "..", "data")
const STORE = path.join(STORE_DIR, "memo.json")

function ensureStoreDir() {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true })
  }
}

function loadStore() {
  if (!fs.existsSync(STORE)) return {}
  try {
    const raw = fs.readFileSync(STORE, "utf8")
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveStore(store) {
  ensureStoreDir()
  fs.writeFileSync(STORE, JSON.stringify(store, null, 2))
}

const LEGACY_COLOR_MAP = {
  purple: "#c8b4ff",
  yellow: "#fffcb4",
  blue: "#b4dcff",
  green: "#c3f5c8",
  pink: "#ffc8e6"
}

function hexToRgb(hex) {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!match) return { r: 200, g: 180, b: 255 }
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16)
  }
}

function applyColorAndOpacity(colorHex, opacity) {
  const { r, g, b } = hexToRgb(colorHex)
  const alpha = Number.isFinite(opacity) && opacity >= 0 && opacity <= 1 ? opacity : 0.85
  document.body.style.setProperty("--note-bg", `rgba(${r},${g},${b},${alpha})`)
}

function saveCurrentNote() {
  const store = loadStore()
  const current = store[noteId] || {}

  const colorHex = colorPicker.value || current.color || "#c8b4ff"
  const opacity = parseFloat(opacitySlider.value || current.opacity || 0.85)
  const fontColor = fontColorPicker.value || current.fontColor || "#000000"

  store[noteId] = {
    ...current,
    content: note.innerHTML,
    color: colorHex,
    opacity,
    fontColor
  }

  saveStore(store)
}

;(function restore() {
  const store = loadStore()
  const current = store[noteId]

  let color = current?.color
  let opacity = parseFloat(current?.opacity) || 0.85
  if (Number.isNaN(opacity) || opacity < 0.3 || opacity > 1) opacity = 0.85
  const fontColor = current?.fontColor || "#000000"

  if (color && LEGACY_COLOR_MAP[color]) {
    color = LEGACY_COLOR_MAP[color]
  }

  if (!color || !/^#([0-9a-fA-F]{6})$/.test(color)) {
    color = "#c8b4ff"
  }

  if (current?.content) {
    note.innerHTML = current.content
  }

  colorPicker.value = color
  opacitySlider.value = String(opacity)
  fontColorPicker.value = fontColor

  applyColorAndOpacity(color, opacity)
  note.style.color = fontColor
})()

/* ===== Events ===== */

const toolbarButtons = document.querySelector(".toolbar-buttons")
if (toolbarButtons) {
  toolbarButtons.addEventListener("mousedown", (e) => {
    e.stopPropagation()
  }, true)
}

note.oninput = saveCurrentNote

colorPicker.onchange = () => {
  applyColorAndOpacity(
    colorPicker.value,
    parseFloat(opacitySlider.value || "0.85")
  )
  saveCurrentNote()
}

opacitySlider.oninput = () => {
  const opacity = parseFloat(opacitySlider.value) || 0.85
  applyColorAndOpacity(colorPicker.value, opacity)
  saveCurrentNote()
}

fontColorPicker.oninput = () => {
  note.style.color = fontColorPicker.value
  saveCurrentNote()
}

newNoteBtn.onclick = () => {
  ipcRenderer.send("create-new-note")
}

settingsToggle.onclick = () => {
  settingsPanel.classList.toggle("open")
}

closeNoteBtn.onclick = () => {
  window.close()
}

/* ===== Keyboard Shortcuts ===== */

window.addEventListener("keydown", (e) => {
  const typing =
    document.activeElement === note ||
    note.contains(document.activeElement)

  if (typing) return

  // New note — Cmd/Ctrl + N
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "n") {
    e.preventDefault()
    ipcRenderer.send("create-new-note")
    return
  }

  // Open settings — Cmd/Ctrl + ,
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key === ",") {
    e.preventDefault()
    settingsPanel.classList.add("open")
  }
})