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
const fontFamilyPicker = document.getElementById("font-family-picker")
const fontSizePicker = document.getElementById("font-size-picker")
const insertBulletListBtn = document.getElementById("insert-bullet-list")
const insertNumberedListBtn = document.getElementById("insert-numbered-list")
const insertChecklistBtn = document.getElementById("insert-checklist")
const overviewBtn = document.getElementById("overview-btn")

const urlParams = new URLSearchParams(window.location.search)
const noteId = urlParams.get("id") || "default"

let STORE_DIR
let STORE

const DEFAULT_NOTE_COLOR = "#ffffff"
const DEFAULT_NOTE_OPACITY = 0.9

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
  if (!match) return { r: 255, g: 255, b: 255 }
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16)
  }
}

function applyColorAndOpacity(colorHex, opacity) {
  const { r, g, b } = hexToRgb(colorHex)
  let alpha = Number(opacity)
  if (!Number.isFinite(alpha) || alpha < 0.3 || alpha > 1) alpha = DEFAULT_NOTE_OPACITY
  document.body.style.setProperty("--note-bg", `rgba(${r},${g},${b},${alpha})`)
}

function applyFontToSelectionOrNote(fontFamily, fontSize) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) {
    note.style.fontFamily = fontFamily
    note.style.fontSize = fontSize + "px"
    saveCurrentNote()
    return
  }
  const range = sel.getRangeAt(0)
  if (!note.contains(sel.anchorNode) || !note.contains(sel.focusNode)) {
    note.style.fontFamily = fontFamily
    note.style.fontSize = fontSize + "px"
    saveCurrentNote()
    return
  }
  if (range.collapsed) {
    note.style.fontFamily = fontFamily
    note.style.fontSize = fontSize + "px"
    saveCurrentNote()
    return
  }
  try {
    const contents = range.extractContents()
    const span = document.createElement("span")
    span.style.fontFamily = fontFamily
    span.style.fontSize = fontSize + "px"
    span.appendChild(contents)
    range.insertNode(span)
    sel.removeAllRanges()
    const newRange = document.createRange()
    newRange.selectNodeContents(span)
    sel.addRange(newRange)
  } catch (_) {
    note.style.fontFamily = fontFamily
    note.style.fontSize = fontSize + "px"
  }
  saveCurrentNote()
}

function applyTextColorToSelectionOrNote(colorHex) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) {
    note.style.color = colorHex
    saveCurrentNote()
    return
  }
  const range = sel.getRangeAt(0)
  if (!note.contains(sel.anchorNode) || !note.contains(sel.focusNode)) {
    note.style.color = colorHex
    saveCurrentNote()
    return
  }
  if (range.collapsed) {
    note.style.color = colorHex
    saveCurrentNote()
    return
  }
  try {
    const contents = range.extractContents()
    const span = document.createElement("span")
    span.style.color = colorHex
    span.appendChild(contents)
    range.insertNode(span)
    sel.removeAllRanges()
    const newRange = document.createRange()
    newRange.selectNodeContents(span)
    sel.addRange(newRange)
  } catch (_) {
    note.style.color = colorHex
  }
  saveCurrentNote()
}

function insertList(type) {
  note.focus()
  if (type === "bullet") {
    document.execCommand("insertUnorderedList", false, null)
  } else if (type === "numbered") {
    document.execCommand("insertOrderedList", false, null)
  }
  saveCurrentNote()
}

function insertChecklist() {
  note.focus()
  const sel = window.getSelection()
  let range = sel && sel.rangeCount ? sel.getRangeAt(0) : null
  if (!range || !note.contains(sel.anchorNode)) {
    range = document.createRange()
    range.selectNodeContents(note)
    range.collapse(true)
    if (sel) sel.removeAllRanges()
    if (sel) sel.addRange(range)
  }
  const span = document.createElement("span")
  span.className = "checklist-box"
  span.contentEditable = "false"
  span.textContent = "☐"
  span.dataset.checked = "false"
  range.insertNode(span)
  const space = document.createTextNode("\u00A0")
  range.setStartAfter(span)
  range.insertNode(space)
  range.setStartAfter(space)
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
  saveCurrentNote()
}

function toggleChecklistBox(box) {
  if (!box || !box.classList.contains("checklist-box")) return
  const checked = box.dataset.checked === "true"
  box.textContent = checked ? "☐" : "☑"
  box.dataset.checked = checked ? "false" : "true"
  saveCurrentNote()
}

function getBlockAncestor(node) {
  let n = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement)
  while (n && n !== note) {
    const tag = n.tagName && n.tagName.toLowerCase()
    if (tag === "div" || tag === "p" || tag === "li") return n
    n = n.parentElement
  }
  return null
}

function isInsideList(sel) {
  if (!sel || sel.rangeCount === 0) return null
  let n = sel.anchorNode
  while (n && n !== note) {
    if (n.nodeType === Node.ELEMENT_NODE && n.tagName) {
      const tag = n.tagName.toLowerCase()
      if (tag === "li") return n
      if (tag === "ul" || tag === "ol") return null
    }
    n = n.parentNode
  }
  return null
}

function blockContainsChecklist(block) {
  return block && block.querySelector && block.querySelector(".checklist-box")
}

function handleEnterInList(e) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return false
  const range = sel.getRangeAt(0)
  if (!note.contains(range.startContainer)) return false

  const li = isInsideList(sel)
  if (li) {
    e.preventDefault()
    const list = li.parentNode
    const newLi = document.createElement("li")
    li.parentNode.insertBefore(newLi, li.nextSibling)
    newLi.appendChild(document.createElement("br"))
    range.setStart(newLi, 0)
    range.setEnd(newLi, 0)
    sel.removeAllRanges()
    sel.addRange(range)
    saveCurrentNote()
    return true
  }

  const block = getBlockAncestor(range.startContainer)
  if (block && blockContainsChecklist(block)) {
    e.preventDefault()
    const newBlock = document.createElement("div")
    const span = document.createElement("span")
    span.className = "checklist-box"
    span.contentEditable = "false"
    span.textContent = "☐"
    span.dataset.checked = "false"
    const space = document.createTextNode("\u00A0")
    newBlock.appendChild(span)
    newBlock.appendChild(space)
    if (block.nextSibling) {
      note.insertBefore(newBlock, block.nextSibling)
    } else {
      note.appendChild(newBlock)
    }
    range.setStart(space, 1)
    range.setEnd(space, 1)
    sel.removeAllRanges()
    sel.addRange(range)
    saveCurrentNote()
    return true
  }

  return false
}

function saveCurrentNote() {
  const store = loadStore()
  const current = store[noteId] || {}

  const colorHex = colorPicker.value || current.color || DEFAULT_NOTE_COLOR
  const rawSlider = parseFloat(opacitySlider.value)
  const opacity = Number.isFinite(rawSlider) ? Math.max(0.3, Math.min(1, 1.3 - rawSlider)) : DEFAULT_NOTE_OPACITY
  const fontColor = fontColorPicker.value || current.fontColor || "#000000"
  const fontFamily = fontFamilyPicker?.value || current.fontFamily || "system-ui"
  const fontSize = fontSizePicker?.value || current.fontSize || "14"

  store[noteId] = {
    ...current,
    content: note.innerHTML,
    color: colorHex,
    opacity: Math.max(0.3, Math.min(1, opacity)),
    fontColor,
    fontFamily,
    fontSize
  }

  saveStore(store)
}

function getMemoNameFromNote() {
  const text = (note.innerText || "").trim()
  const firstLine = text.split("\n")[0] || ""
  return firstLine.trim() || "Untitled"
}

function runRestore() {
  const store = loadStore()
  const current = store[noteId]

  const isNewNote = !current
  let color = current?.color
  let opacity = parseFloat(current?.opacity)
  if (isNewNote || Number.isNaN(opacity) || opacity < 0.3 || opacity > 1) {
    opacity = DEFAULT_NOTE_OPACITY
  }
  const fontColor = current?.fontColor || "#000000"
  const fontFamily = current?.fontFamily || "system-ui"
  const fontSize = current?.fontSize || "14"

  if (color && LEGACY_COLOR_MAP[color]) {
    color = LEGACY_COLOR_MAP[color]
  }

  if (isNewNote || !color || !/^#([0-9a-fA-F]{6})$/.test(color)) {
    color = DEFAULT_NOTE_COLOR
  }

  if (current?.content) {
    note.innerHTML = current.content
  }

  note.querySelectorAll(".checklist-box").forEach((box) => {
    box.dataset.checked = box.textContent.trim() === "☑" ? "true" : "false"
  })

  colorPicker.value = color
  const sliderVal = 1.3 - opacity
  opacitySlider.value = String(Math.max(0.3, Math.min(1, sliderVal)))
  fontColorPicker.value = fontColor
  if (fontFamilyPicker) fontFamilyPicker.value = fontFamily
  if (fontSizePicker) fontSizePicker.value = fontSize

  applyColorAndOpacity(color, opacity)
  note.style.color = fontColor
  note.style.fontFamily = fontFamily
  note.style.fontSize = fontSize + "px"
}

function attachEvents() {
  const toolbarButtons = document.querySelector(".toolbar-buttons-left")
  if (toolbarButtons) {
    toolbarButtons.addEventListener("mousedown", (e) => {
      e.stopPropagation()
    }, true)
  }

  note.oninput = saveCurrentNote

  note.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      handleEnterInList(e)
    }
  })

  colorPicker.onchange = () => {
    const raw = parseFloat(opacitySlider.value)
    const opacity = Number.isFinite(raw) ? Math.max(0.3, Math.min(1, 1.3 - raw)) : 0.85
    applyColorAndOpacity(colorPicker.value, opacity)
    saveCurrentNote()
  }

  opacitySlider.oninput = () => {
    const raw = parseFloat(opacitySlider.value)
    const opacity = Number.isFinite(raw) ? Math.max(0.3, Math.min(1, 1.3 - raw)) : 0.85
    applyColorAndOpacity(colorPicker.value, opacity)
    saveCurrentNote()
  }

  fontColorPicker.oninput = () => {
    applyTextColorToSelectionOrNote(fontColorPicker.value)
  }

  if (fontFamilyPicker) {
    fontFamilyPicker.onchange = () => {
      const font = fontFamilyPicker.value
      const size = fontSizePicker ? fontSizePicker.value + "px" : "14px"
      applyFontToSelectionOrNote(font, fontSizePicker ? fontSizePicker.value : "14")
    }
  }

  if (fontSizePicker) {
    fontSizePicker.onchange = () => {
      const size = fontSizePicker.value
      const font = fontFamilyPicker ? fontFamilyPicker.value : "system-ui"
      applyFontToSelectionOrNote(font, size)
    }
  }

  if (insertBulletListBtn) {
    insertBulletListBtn.onclick = () => insertList("bullet")
  }
  if (insertNumberedListBtn) {
    insertNumberedListBtn.onclick = () => insertList("numbered")
  }
  if (insertChecklistBtn) {
    insertChecklistBtn.onclick = insertChecklist
  }

  note.addEventListener("click", (e) => {
    const box = e.target.classList && e.target.classList.contains("checklist-box") ? e.target : null
    if (box) {
      e.preventDefault()
      toggleChecklistBox(box)
    }
  })

  newNoteBtn.onclick = () => {
    ipcRenderer.send("create-new-note")
  }

  if (overviewBtn) {
    overviewBtn.addEventListener("mousedown", (e) => e.stopPropagation(), true)
    overviewBtn.onclick = () => {
      ipcRenderer.send("open-overview")
    }
  }

  settingsToggle.onclick = () => {
    settingsPanel.classList.toggle("open")
  }

  settingsPanel.addEventListener("click", (e) => {
    const toggle = e.target.closest(".settings-section-toggle")
    if (!toggle) return
    const section = toggle.closest(".settings-section")
    if (!section) return
    section.classList.toggle("collapsed")
    const expanded = !section.classList.contains("collapsed")
    toggle.setAttribute("aria-expanded", String(expanded))
  })

  closeNoteBtn.onclick = () => {
    window.close()
  }

  window.addEventListener("keydown", (e) => {
    const typing =
      document.activeElement === note ||
      note.contains(document.activeElement)

    if (typing) return

    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "n") {
      e.preventDefault()
      ipcRenderer.send("create-new-note")
      return
    }

    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key === ",") {
      e.preventDefault()
      settingsPanel.classList.add("open")
    }
  })
}

;(async function init() {
  const userData = await ipcRenderer.invoke("get-user-data-path")
  STORE_DIR = userData
  STORE = path.join(userData, "memo.json")
  runRestore()
  attachEvents()
})()