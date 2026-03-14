#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

// ── Data structures ────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Default)]
struct NoteData {
    content: Option<String>,
    color: Option<String>,
    opacity: Option<f64>,
    #[serde(default)]
    font_color: Option<String>,
    #[serde(default)]
    font_family: Option<String>,
    #[serde(default)]
    font_size: Option<String>,
    #[serde(default)]
    title: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct WindowEntry {
    id: String,
    x: Option<f64>,
    y: Option<f64>,
    width: Option<f64>,
    height: Option<f64>,
}

#[derive(Serialize, Clone)]
struct NoteInfo {
    label: String,
    title: String,
    visible: bool,
}

// ── Paths ──────────────────────────────────────────────────────────────────────

fn data_dir() -> std::path::PathBuf {
    let dir = dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("minimemo");
    fs::create_dir_all(&dir).ok();
    dir
}

fn store_path() -> std::path::PathBuf { data_dir().join("memo.json") }
fn windows_path() -> std::path::PathBuf { data_dir().join("windows.json") }

// ── Store helpers ──────────────────────────────────────────────────────────────

fn read_store() -> serde_json::Map<String, serde_json::Value> {
    fs::read_to_string(store_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_store(store: &serde_json::Map<String, serde_json::Value>) {
    fs::write(store_path(), serde_json::to_string(store).unwrap_or_default()).ok();
}

fn read_windows() -> Vec<WindowEntry> {
    fs::read_to_string(windows_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_windows(entries: &[WindowEntry]) {
    fs::write(windows_path(), serde_json::to_string(entries).unwrap_or_default()).ok();
}

// ── Tauri commands ─────────────────────────────────────────────────────────────

#[tauri::command]
fn load_note(id: String) -> NoteData {
    let store = read_store();
    store.get(&id)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default()
}

#[tauri::command]
fn save_note(id: String, data: NoteData) {
    let mut store = read_store();
    // Preserve existing title if the incoming data has none
    let existing_title = store.get(&id)
        .and_then(|v| serde_json::from_value::<NoteData>(v.clone()).ok())
        .and_then(|d| d.title);
    let mut d = data;
    if d.title.is_none() {
        d.title = existing_title;
    }
    store.insert(id, serde_json::to_value(d).unwrap());
    write_store(&store);
}

#[tauri::command]
fn get_notes_info(app: AppHandle) -> Vec<NoteInfo> {
    let store = read_store();
    let open: HashSet<String> = app.webview_windows()
        .keys()
        .filter(|l| *l != "main" && *l != "overview")
        .cloned()
        .collect();

    let mut infos: Vec<NoteInfo> = store.iter()
        .filter(|(l, _)| l.as_str() != "main" && l.as_str() != "overview")
        .filter_map(|(label, val)| {
            let data: NoteData = serde_json::from_value(val.clone()).unwrap_or_default();
            let has_title = data.title.as_deref().map(|t| !t.is_empty() && t != "minimemo" && t != "Untitled").unwrap_or(false);
            let has_content = data.content.as_deref().map(|c| !c.trim_matches(|ch: char| ch.is_whitespace() || ch == '\u{00a0}').is_empty()).unwrap_or(false);
            // Only show in overview if the user gave it a custom title OR wrote something in it
            if !has_title && !has_content {
                return None;
            }
            Some(NoteInfo {
                label: label.clone(),
                title: data.title.filter(|t| !t.is_empty()).unwrap_or_else(|| "Untitled".to_string()),
                visible: open.contains(label),
            })
        })
        .collect();

    infos.sort_by(|a, b| b.visible.cmp(&a.visible).then(a.label.cmp(&b.label)));
    infos
}

#[tauri::command]
fn rename_note(id: String, title: String) {
    let mut store = read_store();
    let mut data: NoteData = store.get(&id)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();
    data.title = Some(title);
    store.insert(id, serde_json::to_value(data).unwrap());
    write_store(&store);
}

#[tauri::command]
fn toggle_note_visibility(app: AppHandle, label: String) {
    if let Some(win) = app.get_webview_window(&label) {
        // Save position before hiding
        if let (Ok(pos), Ok(size)) = (win.outer_position(), win.outer_size()) {
            let mut entries = read_windows();
            let entry = entries.iter_mut().find(|e| e.id == label);
            if let Some(e) = entry {
                e.x = Some(pos.x as f64);
                e.y = Some(pos.y as f64);
                e.width = Some(size.width as f64);
                e.height = Some(size.height as f64);
            } else {
                entries.push(WindowEntry {
                    id: label.clone(),
                    x: Some(pos.x as f64),
                    y: Some(pos.y as f64),
                    width: Some(size.width as f64),
                    height: Some(size.height as f64),
                });
            }
            write_windows(&entries);
        }
        let _ = win.close();
    } else {
        // Re-open from saved position
        let entries = read_windows();
        let entry = entries.iter().find(|e| e.id == label).cloned();
        create_note_window(&app, entry.as_ref());
    }
}

#[tauri::command]
fn delete_note(app: AppHandle, label: String) {
    if let Some(win) = app.get_webview_window(&label) {
        let _ = win.close();
    }
    let mut store = read_store();
    store.remove(&label);
    write_store(&store);
    let mut entries = read_windows();
    entries.retain(|e| e.id != label);
    write_windows(&entries);
}

#[tauri::command]
fn focus_note(app: AppHandle, label: String) {
    if let Some(win) = app.get_webview_window(&label) {
        let _ = win.set_focus();
    }
}

#[tauri::command]
fn create_new_note(app: AppHandle) {
    create_note_window(&app, None);
}

#[tauri::command]
fn open_overview(app: AppHandle) {
    if let Some(win) = app.get_webview_window("overview") {
        let _ = win.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(&app, "overview", WebviewUrl::App("overview.html".into()))
        .title("minimemo")
        .inner_size(340.0, 420.0)
        .min_inner_size(260.0, 200.0)
        .decorations(true)
        .resizable(true)
        .build();
}

// ── Window helpers ─────────────────────────────────────────────────────────────

fn save_window_entries(app: &AppHandle) {
    let entries: Vec<WindowEntry> = app.webview_windows()
        .values()
        .filter(|w| w.label() != "main" && w.label() != "overview")
        .filter_map(|w| {
            let pos = w.outer_position().ok()?;
            let size = w.outer_size().ok()?;
            Some(WindowEntry {
                id: w.label().to_string(),
                x: Some(pos.x as f64),
                y: Some(pos.y as f64),
                width: Some(size.width as f64),
                height: Some(size.height as f64),
            })
        })
        .collect();
    write_windows(&entries);
}

static COUNTER: Mutex<u64> = Mutex::new(0);

fn next_id() -> String {
    let mut c = COUNTER.lock().unwrap();
    *c += 1;
    format!("note-{}-{}", std::process::id(), *c)
}

fn center_on_screen(app: &AppHandle, width: f64, height: f64) -> (f64, f64) {
    if let Ok(Some(m)) = app.primary_monitor() {
        let scale = m.scale_factor();
        let sw = m.size().width as f64 / scale;
        let sh = m.size().height as f64 / scale;
        let mx = m.position().x as f64 / scale;
        let my = m.position().y as f64 / scale;
        return ((mx + (sw - width) / 2.0).max(mx), (my + (sh - height) / 2.0).max(my));
    }
    (120.0, 120.0)
}

fn create_note_window(app: &AppHandle, entry: Option<&WindowEntry>) {
    let label = entry.map(|e| e.id.clone()).unwrap_or_else(next_id);
    let width = entry.and_then(|e| e.width).unwrap_or(300.0);
    let height = entry.and_then(|e| e.height).unwrap_or(400.0);

    let mut builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::default())
        .title("minimemo")
        .inner_size(width, height)
        .decorations(false)
        .transparent(true)
        .resizable(true)
        .shadow(true)
        .always_on_top(false)
        .skip_taskbar(true)
        .visible_on_all_workspaces(true);

    let pos = entry.and_then(|e| e.x.zip(e.y));
    if let Some((x, y)) = pos {
        builder = builder.position(x, y);
    } else {
        let (cx, cy) = center_on_screen(app, width, height);
        builder = builder.position(cx, cy);
    }

    if let Ok(win) = builder.build() {
        win.show().ok();
        let app_handle = app.clone();
        win.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                save_window_entries(&app_handle);
            }
        });
    }
}

// ── main ───────────────────────────────────────────────────────────────────────

fn main() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        let cmd_n = Shortcut::new(Some(Modifiers::SUPER), Code::KeyN);
                        if shortcut == &cmd_n {
                            create_note_window(app, None);
                        }
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            load_note,
            save_note,
            create_new_note,
            get_notes_info,
            rename_note,
            toggle_note_visibility,
            delete_note,
            focus_note,
            open_overview,
        ])
        .setup(|app| {
            let shortcut = Shortcut::new(Some(Modifiers::SUPER), Code::KeyN);
            app.global_shortcut().register(shortcut)?;

            let store = read_store();
            let entries = read_windows();
            let valid: Vec<&WindowEntry> = entries.iter()
                .filter(|e| store.contains_key(&e.id))
                .collect();

            if valid.is_empty() {
                create_note_window(app.handle(), None);
            } else {
                for entry in valid {
                    create_note_window(app.handle(), Some(entry));
                }
            }

            if let Some(w) = app.get_webview_window("main") {
                w.close().ok();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running minimemo");
}
