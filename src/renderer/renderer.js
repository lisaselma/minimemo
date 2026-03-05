const { ipcRenderer } = require("electron")
const fs = require("fs")
const path = require("path")

const note = document.getElementById("note")
const newNoteBtn = document.getElementById("new-note")
const colorPicker = document.getElementById("color-picker")
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

const COLOR_MAP = {
  purple: "rgba(200,180,255,.85)",
  yellow: "rgba(255,252,180,.9)",
  blue: "rgba(180,220,255,.85)",
  green: "rgba(195,245200,.9)",
  pink: "rgba(255,200,230,.9)"
}

function applyColor(colorKey) {
  const color = COLOR_MAP[colorKey] || COLOR_MAP.purple
  document.body.style.setProperty("--note-bg", color)
}

function saveCurrentNote() {
  const store = loadStore()
  const current = store[noteId] || {}
  store[noteId] = {
    ...current,
    content: note.innerHTML,
    color: colorPicker.value || current.color || "purple"
  }
  saveStore(store)
}

;(function restore() {
  const store = loadStore()
  const current = store[noteId]
  if (current?.content) {
    note.innerHTML = current.content
  }
  if (current?.color && COLOR_MAP[current.color]) {
    colorPicker.value = current.color
    applyColor(current.color)
  } else {
    colorPicker.value = "purple"
    applyColor("purple")
  }
})()

note.oninput = () => {
  saveCurrentNote()
}

colorPicker.onchange = () => {
  applyColor(colorPicker.value)
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

