const { app, BrowserWindow, globalShortcut, ipcMain } = require("electron")
const fs = require("fs")
const path = require("path")

const STORE = path.join(app.getPath("userData"), "notes.json")
const ICON = path.join(__dirname, "..", "..", "assets", "images", "bok.png")
let windows = []

function createNote(bounds, id) {
  const win = new BrowserWindow({
    width: bounds?.width || 300,
    height: bounds?.height || 400,
    x: bounds?.x,
    y: bounds?.y,

    frame: false,
    transparent: true,
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

  win.setAlwaysOnTop(false)
  win.setVisibleOnAllWorkspaces(true)
  win.setMovable(true)
  win.setFocusable(true)
  win.setFullScreenable(false)

  win.noteId = id || Date.now().toString()
  win.loadFile(path.join(__dirname, "../renderer/index.html"), {
    query: { id: win.noteId }
  })

  win.on("close", saveAllNotes)
  windows.push(win)

  win.on("closed", () => {
    windows = windows.filter(w => w !== win)
  })

  return win
}

function saveAllNotes() {
  const aliveWindows = windows.filter(w => !w.isDestroyed())

  const data = aliveWindows.map(w => ({
    id: w.noteId,
    bounds: w.getBounds()
  }))

  fs.writeFileSync(STORE, JSON.stringify(data))
}

function restoreNotes() {
  if (!fs.existsSync(STORE)) return createNote()
  const saved = JSON.parse(fs.readFileSync(STORE))
  saved.forEach(n => createNote(n.bounds, n.id))
}

app.whenReady().then(() => {
  if (process.platform === "darwin" && app.dock) {
    app.dock.setIcon(ICON)
  }

  restoreNotes()
  globalShortcut.register("CommandOrControl+N", () => createNote())
})

ipcMain.on("create-new-note", () => {
  createNote()
})

app.on("window-all-closed", saveAllNotes)

