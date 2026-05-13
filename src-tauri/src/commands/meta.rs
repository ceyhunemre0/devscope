use serde::Serialize;
use crate::error::AppResult;

#[derive(Serialize)]
pub struct HealthInfo {
    pub version: String,
    pub status: &'static str,
}

#[tauri::command]
pub async fn health() -> AppResult<HealthInfo> {
    Ok(HealthInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        status: "ok",
    })
}
