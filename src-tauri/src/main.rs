#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[derive(Serialize, Deserialize, Clone, Default)]
struct NoteData {
    content: Option<String>,
    color: Option<String>,
    opacity: Option<f64>,
}

#[derive(Serialize, Deserialize, Clone)]
struct WindowEntry {
    id: String,
    x: Option<f64>,
    y: Option<f64>,
    width: Option<f64>,
    height: Option<f64>,
}

fn store_path() -> std::path::PathBuf {
    let dir = dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("minimemo");
    fs::create_dir_all(&dir).ok();
    dir.join("memo.json")
}

fn windows_path() -> std::path::PathBuf {
    let dir = dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("minimemo");
    fs::create_dir_all(&dir).ok();
    dir.join("windows.json")
}

#[tauri::command]
fn load_note(id: String) -> NoteData {
    let path = store_path();
    let store: serde_json::Map<String, serde_json::Value> = fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    store
        .get(&id)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default()
}

#[tauri::command]
fn save_note(id: String, data: NoteData) {
    let path = store_path();
    let mut store: serde_json::Map<String, serde_json::Value> = fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    store.insert(id, serde_json::to_value(data).unwrap());
    fs::write(&path, serde_json::to_string(&store).unwrap()).ok();
}

fn save_window_entries(app: &AppHandle) {
    let entries: Vec<WindowEntry> = app
        .webview_windows()
        .values()
        .filter_map(|w| {
            let label = w.label().to_string();
            let pos = w.outer_position().ok()?;
            let size = w.outer_size().ok()?;
            Some(WindowEntry {
                id: label,
                x: Some(pos.x as f64),
                y: Some(pos.y as f64),
                width: Some(size.width as f64),
                height: Some(size.height as f64),
            })
        })
        .collect();
    fs::write(
        windows_path(),
        serde_json::to_string(&entries).unwrap_or_default(),
    )
    .ok();
}

static COUNTER: Mutex<u64> = Mutex::new(0);

fn next_id() -> String {
    let mut c = COUNTER.lock().unwrap();
    *c += 1;
    format!("note-{}-{}", std::process::id(), *c)
}

fn create_note_window(app: &AppHandle, entry: Option<&WindowEntry>) {
    let label = entry
        .map(|e| e.id.clone())
        .unwrap_or_else(next_id);
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

    if let Some(e) = entry {
        if let (Some(x), Some(y)) = (e.x, e.y) {
            builder = builder.position(x, y);
        }
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

#[tauri::command]
fn create_new_note(app: AppHandle) {
    create_note_window(&app, None);
}

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
        .invoke_handler(tauri::generate_handler![load_note, save_note, create_new_note])
        .setup(|app| {
            let shortcut = Shortcut::new(Some(Modifiers::SUPER), Code::KeyN);
            app.global_shortcut().register(shortcut)?;

            let entries: Vec<WindowEntry> = fs::read_to_string(windows_path())
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default();

            if entries.is_empty() {
                create_note_window(app.handle(), None);
            } else {
                for entry in &entries {
                    create_note_window(app.handle(), Some(entry));
                }
            }

            // Hide the default "main" window from tauri.conf.json
            if let Some(main_win) = app.get_webview_window("main") {
                main_win.close().ok();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running minimemo");
}
