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
  fs.writeFileSync(STORE, JSON.stringify(store))
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
  const alpha = typeof opacity === "number" ? opacity : 0.85
  document.body.style.setProperty("--note-bg", `rgba(${r},${g},${b},${alpha})`)
}

function saveCurrentNote() {
  const store = loadStore()
  const current = store[noteId] || {}
  const colorHex = colorPicker.value || current.color || "#c8b4ff"
  const opacity = parseFloat(opacitySlider.value || current.opacity || 0.85)
  store[noteId] = {
    ...current,
    content: note.innerHTML,
    color: colorHex,
    opacity
  }
  saveStore(store)
}

;(function restore() {
  const store = loadStore()
  const current = store[noteId]
  let color = current?.color
  let opacity = typeof current?.opacity === "number" ? current.opacity : 0.85

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
  opacitySlider.value = opacity.toString()
  applyColorAndOpacity(color, opacity)
})()

note.oninput = () => {
  saveCurrentNote()
}

colorPicker.onchange = () => {
  applyColorAndOpacity(colorPicker.value, parseFloat(opacitySlider.value || "0.85"))
  saveCurrentNote()
}

opacitySlider.oninput = () => {
  applyColorAndOpacity(colorPicker.value, parseFloat(opacitySlider.value || "0.85"))
  saveCurrentNote()
}

newNoteBtn.onclick = () => {
  ipcRenderer.send("create-new-note")
}

settingsToggle.onclick = () => {
  const isHidden = settingsPanel.style.display === "none"
  settingsPanel.style.display = isHidden ? "block" : "none"
}

closeNoteBtn.onclick = () => {
  window.close()
}

window.addEventListener("keydown", (e) => {
  if (e.metaKey && !e.shiftKey && !e.altKey && !e.ctrlKey && e.key.toLowerCase() === "n") {
    e.preventDefault()
    ipcRenderer.send("create-new-note")
    return
  }

  if (e.metaKey && !e.shiftKey && !e.altKey && !e.ctrlKey && e.key.toLowerCase() === "c") {
    e.preventDefault()
    settingsPanel.style.display = "block"
    colorPicker.focus()
    const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window })
    colorPicker.dispatchEvent(event)
  }
})

