pub mod commands;
pub mod config;
pub mod db;
pub mod error;
pub mod git;
pub mod github_api;
pub mod llm;
pub mod paths;
pub mod prompts;
pub mod secrets;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
