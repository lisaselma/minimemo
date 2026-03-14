const { invoke } = window.__TAURI__.core;
const { getCurrentWebviewWindow } = window.__TAURI__.webviewWindow;

const note = document.getElementById("note");
const newNoteBtn = document.getElementById("new-note");
const colorPicker = document.getElementById("color-picker");
const opacitySlider = document.getElementById("opacity-slider");
const settingsToggle = document.getElementById("settings-toggle");
const closeNoteBtn = document.getElementById("close-note");
const settingsPanel = document.getElementById("settings-panel");

const noteId = getCurrentWebviewWindow().label || "default";

const LEGACY_COLOR_MAP = {
  purple: "#c8b4ff",
  yellow: "#fffcb4",
  blue: "#b4dcff",
  green: "#c3f5c8",
  pink: "#ffc8e6",
};

function hexToRgb(hex) {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return { r: 200, g: 180, b: 255 };
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  };
}

function applyColorAndOpacity(colorHex, opacity) {
  const { r, g, b } = hexToRgb(colorHex);
  const alpha = typeof opacity === "number" ? opacity : 0.85;
  document.body.style.setProperty("--note-bg", `rgba(${r},${g},${b},${alpha})`);
}

async function saveCurrentNote() {
  const colorHex = colorPicker.value || "#c8b4ff";
  const opacity = parseFloat(opacitySlider.value || "0.85");
  await invoke("save_note", {
    id: noteId,
    data: {
      content: note.innerHTML,
      color: colorHex,
      opacity,
    },
  });
}

async function restore() {
  const current = await invoke("load_note", { id: noteId });
  let color = current?.color;
  let opacity = typeof current?.opacity === "number" ? current.opacity : 0.85;

  if (color && LEGACY_COLOR_MAP[color]) {
    color = LEGACY_COLOR_MAP[color];
  }
  if (!color || !/^#([0-9a-fA-F]{6})$/.test(color)) {
    color = "#c8b4ff";
  }

  if (current?.content) {
    note.innerHTML = current.content;
  }

  colorPicker.value = color;
  opacitySlider.value = opacity.toString();
  applyColorAndOpacity(color, opacity);
}

restore();

note.oninput = () => saveCurrentNote();

colorPicker.onchange = () => {
  applyColorAndOpacity(colorPicker.value, parseFloat(opacitySlider.value || "0.85"));
  saveCurrentNote();
};

opacitySlider.oninput = () => {
  applyColorAndOpacity(colorPicker.value, parseFloat(opacitySlider.value || "0.85"));
  saveCurrentNote();
};

newNoteBtn.onclick = () => invoke("create_new_note");

settingsToggle.onclick = () => {
  const isHidden = settingsPanel.style.display === "none";
  settingsPanel.style.display = isHidden ? "block" : "none";
};

closeNoteBtn.onclick = () => getCurrentWebviewWindow().close();

window.addEventListener("keydown", (e) => {
  if (e.metaKey && !e.shiftKey && !e.altKey && !e.ctrlKey && e.key.toLowerCase() === "n") {
    e.preventDefault();
    invoke("create_new_note");
    return;
  }

  if (e.metaKey && !e.shiftKey && !e.altKey && !e.ctrlKey && e.key.toLowerCase() === "c") {
    e.preventDefault();
    settingsPanel.style.display = "block";
    colorPicker.focus();
    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      view: window,
    });
    colorPicker.dispatchEvent(event);
  }
});
