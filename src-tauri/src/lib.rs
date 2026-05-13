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

use commands::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                let db_path = paths::db_path().expect("db path");
                let pool = db::connect(&db_path).await.expect("db connect");
                handle.manage(AppState { pool });
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::meta::health,
            commands::projects::list_projects,
            commands::projects::add_project,
            commands::projects::update_project,
            commands::projects::delete_project,
            commands::projects::discover_repos,
            commands::projects::bulk_add_projects,
            commands::projects::working_tree_status_for_project,
            commands::reports::list_reports,
            commands::reports::get_report,
            commands::reports::run_today,
            commands::dashboard::get_dashboard,
            commands::stats::get_stats,
            commands::commit::get_commit_context,
            commands::commit::generate_commit_message,
            commands::github::github_status,
            commands::github::set_github_token,
            commands::github::list_github_repos,
            commands::github::clone_github_repo,
            commands::github::github_contributions,
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::secrets::set_secret,
            commands::secrets::delete_secret,
            commands::secrets::get_secret_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
