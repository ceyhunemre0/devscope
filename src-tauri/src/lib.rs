use std::net::TcpListener;
use std::sync::Mutex;

use tauri::{Manager, RunEvent};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

struct BackendProcess(Mutex<Option<CommandChild>>);

fn find_free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .ok()
        .and_then(|l| l.local_addr().ok())
        .map(|addr| addr.port())
        .unwrap_or(8765)
}

#[tauri::command]
fn backend_port(state: tauri::State<u16>) -> u16 {
    *state
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let port = find_free_port();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())
        .manage(port)
        .manage(BackendProcess(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![backend_port])
        .setup(move |app| {
            let sidecar = app
                .shell()
                .sidecar("devscope-backend")
                .expect("sidecar binary missing")
                .env("DEVSCOPE_PORT", port.to_string())
                .env("DEVSCOPE_HOST", "127.0.0.1");

            let (_rx, child) = sidecar.spawn().expect("failed to spawn devscope-backend");

            let state: tauri::State<BackendProcess> = app.state();
            *state.0.lock().unwrap() = Some(child);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app_handle, event| {
            if let RunEvent::Exit = event {
                let state: tauri::State<BackendProcess> = app_handle.state();
                if let Some(child) = state.0.lock().unwrap().take() {
                    let _ = child.kill();
                };
            }
        });
}
