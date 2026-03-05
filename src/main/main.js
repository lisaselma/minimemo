const { app, BrowserWindow, globalShortcut, ipcMain } = require("electron")
const fs = require("fs")
const path = require("path")

const STORE = path.join(app.getPath("userData"), "notes.json")
const ICON = path.join(__dirname, "..", "..", "assets", "images", "bok.png")

let windows = []

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

  win.on("close", saveAllNotes)

  win.on("closed", () => {
    windows = windows.filter(w => w !== win)
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
})

app.on("before-quit", saveAllNotes)

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createNote()
  }
})