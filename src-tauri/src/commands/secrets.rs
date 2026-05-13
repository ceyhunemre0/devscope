use serde::Serialize;

use crate::error::AppResult;
use crate::secrets;

#[tauri::command]
#[specta::specta]
pub async fn set_secret(key: String, value: String) -> AppResult<()> {
    secrets::set(&key, &value)
}

#[tauri::command]
#[specta::specta]
pub async fn delete_secret(key: String) -> AppResult<()> {
    secrets::delete(&key)
}

#[derive(Serialize, specta::Type)]
pub struct SecretStatus {
    pub openai_key_stored: bool,
    pub openai_key_masked: Option<String>,
    pub github_token_stored: bool,
    pub openai_env_active: bool,
}

#[tauri::command]
#[specta::specta]
pub async fn get_secret_status() -> AppResult<SecretStatus> {
    let openai_secret = secrets::get("OPENAI_API_KEY")?;
    let github_secret = secrets::get("GITHUB_TOKEN")?;
    let openai_env_active = std::env::var("OPENAI_API_KEY").is_ok();
    Ok(SecretStatus {
        openai_key_stored: openai_secret.is_some(),
        openai_key_masked: openai_secret.as_deref().map(secrets::mask),
        github_token_stored: github_secret.is_some(),
        openai_env_active,
    })
}
