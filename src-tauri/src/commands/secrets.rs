use crate::error::AppResult;
use crate::secrets;

#[tauri::command]
pub async fn set_secret(key: String, value: String) -> AppResult<()> {
    secrets::set(&key, &value)
}

#[tauri::command]
pub async fn delete_secret(key: String) -> AppResult<()> {
    secrets::delete(&key)
}
