use serde::Deserialize;

use crate::config::{self, Settings};
use crate::error::AppResult;

#[derive(Deserialize, specta::Type)]
pub struct SettingsPatch {
    pub monthly_usd: Option<f64>,
    pub hard_stop: Option<bool>,
    pub openai_model: Option<String>,
    pub ollama_model: Option<String>,
    pub provider_chain: Option<Vec<String>>,
    pub auto_rescan_days: Option<u32>,
    pub max_discover_depth: Option<u32>,
}

#[tauri::command]
#[specta::specta]
pub async fn get_settings() -> AppResult<Settings> { config::load() }

#[tauri::command]
#[specta::specta]
pub async fn save_settings(patch: SettingsPatch) -> AppResult<Settings> {
    let mut s = config::load()?;
    if let Some(v) = patch.monthly_usd       { s.llm.budget.monthly_usd = v; }
    if let Some(v) = patch.hard_stop         { s.llm.budget.hard_stop = v; }
    if let Some(v) = patch.openai_model      { s.llm.default_model.openai = v; }
    if let Some(v) = patch.ollama_model      { s.llm.default_model.ollama = v; }
    if let Some(v) = patch.provider_chain    { s.llm.provider_chain = v; }
    if let Some(v) = patch.auto_rescan_days  { s.scanner.auto_rescan_days = v; }
    if let Some(v) = patch.max_discover_depth{ s.scanner.max_discover_depth = v; }
    config::save(&s)?;
    Ok(s)
}
