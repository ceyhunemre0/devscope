use serde::Serialize;
use crate::error::AppResult;

#[derive(Serialize, specta::Type)]
pub struct HealthInfo {
    pub version: String,
    pub status: String,
}

#[tauri::command]
#[specta::specta]
pub async fn health() -> AppResult<HealthInfo> {
    Ok(HealthInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        status: "ok".to_string(),
    })
}
