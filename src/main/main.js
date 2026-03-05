const { app, BrowserWindow, globalShortcut, ipcMain } = require("electron")
const fs = require("fs")
const path = require("path")

const STORE = path.join(app.getPath("userData"), "notes.json")
const MEMO_STORE = path.join(app.getPath("userData"), "memo.json")
const MEMO_TITLES_PATH = path.join(app.getPath("userData"), "memo-titles.json")
const ICON = path.join(__dirname, "..", "..", "assets", "images", "bok.png")

let windows = []
let overviewWindow = null
let isQuitting = false

function getMemoTitleFromContent(html) {
  if (!html || typeof html !== "string") return "Untitled"
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  const firstLine = text.split("\n")[0] || text
  const trimmed = firstLine.trim()
  if (!trimmed) return "Untitled"
  const maxLen = 50
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) + "…" : trimmed
}

function loadMemoStore() {
  try {
    if (!fs.existsSync(MEMO_STORE)) return {}
    const raw = fs.readFileSync(MEMO_STORE, "utf8")
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function loadMemoTitles() {
  try {
    if (!fs.existsSync(MEMO_TITLES_PATH)) return {}
    const raw = fs.readFileSync(MEMO_TITLES_PATH, "utf8")
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveMemoTitles(titles) {
  try {
    fs.writeFileSync(MEMO_TITLES_PATH, JSON.stringify(titles, null, 2))
  } catch (e) {
    console.error("Failed to save memo titles:", e)
  }
}

function openOverview() {
  if (overviewWindow && !overviewWindow.isDestroyed()) {
    overviewWindow.focus()
    return
  }
  overviewWindow = new BrowserWindow({
    width: 320,
    height: 380,
    resizable: true,
    minimizable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })
  overviewWindow.loadFile(path.join(__dirname, "../renderer/overview.html"))
  overviewWindow.on("closed", () => {
    overviewWindow = null
  })
}

function notifyOverviewListChanged() {
  if (overviewWindow && !overviewWindow.isDestroyed()) {
    overviewWindow.webContents.send("memo-list-changed")
  }
}

function createNote(bounds = {}, id) {
  const win = new BrowserWindow({
    width: bounds.width ?? 300,
    height: bounds.height ?? 400,
    x: bounds.x,
    y: bounds.y,

    frame: false,
    transparent: true,
    backgroundColor: "#00000000",

    resizable: true,
    hasShadow: true,
    icon: ICON,

    alwaysOnTop: false,
    skipTaskbar: true,
    focusable: true,

    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  win.noteId = id || Date.now().toString()

  win.loadFile(path.join(__dirname, "../renderer/index.html"), {
    query: { id: win.noteId }
  })

  win.webContents.on("did-finish-load", () => {
    win.setIgnoreMouseEvents(false)
  })

  windows.push(win)

  win.on("close", (e) => {
    saveAllNotes()
    if (!isQuitting && !win.forceClose) {
      e.preventDefault()
      win.hide()
      notifyOverviewListChanged()
    }
  })

  win.on("closed", () => {
    windows = windows.filter(w => w !== win)
    notifyOverviewListChanged()
  })

  return win
}

function saveAllNotes() {
  const alive = windows.filter(w => !w.isDestroyed())

  const data = alive.map(w => ({
    id: w.noteId,
    bounds: w.getBounds()
  }))

  try {
    fs.writeFileSync(STORE, JSON.stringify(data, null, 2))
  } catch (e) {
    console.error("Failed to save notes:", e)
  }
}

function restoreNotes() {
  try {
    if (!fs.existsSync(STORE)) {
      createNote()
      return
    }

    const saved = JSON.parse(fs.readFileSync(STORE, "utf8"))

    if (!Array.isArray(saved) || saved.length === 0) {
      createNote()
      return
    }

    saved.forEach(n => createNote(n.bounds, n.id))
  } catch {
    createNote()
  }
}

app.whenReady().then(() => {
  if (process.platform === "darwin" && app.dock) {
    app.dock.setIcon(ICON)
  }

  restoreNotes()

  globalShortcut.register("CommandOrControl+N", () => {
    createNote()
  })
})

ipcMain.on("create-new-note", () => {
  createNote()
  notifyOverviewListChanged()
})

ipcMain.handle("get-memo-windows", () => {
  const memoStore = loadMemoStore()
  const customTitles = loadMemoTitles()
  return windows
    .filter(w => !w.isDestroyed())
    .map(w => {
      const note = memoStore[w.noteId]
      const content = note && note.content
      const contentTitle = content ? getMemoTitleFromContent(content) : "Untitled"
      const title = customTitles[w.noteId] !== undefined && customTitles[w.noteId] !== ""
        ? customTitles[w.noteId]
        : contentTitle
      return { id: w.noteId, visible: w.isVisible(), title }
    })
})

ipcMain.on("set-memo-title", (_, id, title) => {
  const titles = loadMemoTitles()
  const trimmed = typeof title === "string" ? title.trim() : ""
  if (trimmed) {
    titles[id] = trimmed
  } else {
    delete titles[id]
  }
  saveMemoTitles(titles)
  notifyOverviewListChanged()
})

ipcMain.on("set-memo-visible", (_, id, visible) => {
  const w = windows.find(x => !x.isDestroyed() && x.noteId === id)
  if (w) {
    if (visible) w.show()
    else w.hide()
  }
})

ipcMain.on("destroy-memo", (_, id) => {
  const w = windows.find(x => !x.isDestroyed() && x.noteId === id)
  if (w) {
    w.forceClose = true
    w.close()
  }
})

ipcMain.on("open-overview", () => {
  openOverview()
})

ipcMain.handle("get-user-data-path", () => app.getPath("userData"))

app.on("before-quit", () => {
  isQuitting = true
  saveAllNotes()
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})

app.on("activate", () => {
  const all = BrowserWindow.getAllWindows()
  const visible = all.filter(w => w.isVisible())
  if (visible.length === 0) {
    if (all.length > 0) {
      all[0].show()
    } else {
      createNote()
    }
  }
})