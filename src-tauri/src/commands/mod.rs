pub mod commit;
pub mod dashboard;
pub mod github;
pub mod meta;
pub mod projects;
pub mod reports;
pub mod secrets;
pub mod settings;
pub mod stats;

use sqlx::SqlitePool;

/// Shared state available to every command via `tauri::State<AppState>`.
pub struct AppState {
    pub pool: SqlitePool,
}
