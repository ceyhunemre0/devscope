use chrono::Utc;
use serde::Deserialize;
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::db::models::Project;
use crate::git::discover::{walk_for_repos, DiscoveredRepo};
use super::AppState;

#[derive(Deserialize)]
pub struct ProjectPatch {
    pub name: Option<String>,
    pub state: Option<String>,
}

#[derive(Deserialize)]
pub struct BulkAddItem {
    pub path: String,
    pub name: String,
}

#[tauri::command]
pub async fn list_projects(state: State<'_, AppState>) -> AppResult<Vec<Project>> {
    let rows = sqlx::query_as::<_, Project>("SELECT * FROM projects ORDER BY created_at DESC")
        .fetch_all(&state.pool)
        .await?;
    Ok(rows)
}

#[tauri::command]
pub async fn add_project(state: State<'_, AppState>, path: String, name: String) -> AppResult<Project> {
    let p = std::path::Path::new(&path);
    if !p.join(".git").exists() {
        return Err(AppError::NotAGitRepo { path: path.clone() });
    }
    let now = Utc::now();
    let row: Project = sqlx::query_as(
        "INSERT INTO projects (name, path, state, created_at, updated_at)
         VALUES (?, ?, 'active', ?, ?) RETURNING *"
    )
    .bind(&name).bind(&path).bind(now).bind(now)
    .fetch_one(&state.pool).await?;
    Ok(row)
}

#[tauri::command]
pub async fn update_project(state: State<'_, AppState>, id: i64, patch: ProjectPatch) -> AppResult<Project> {
    let now = Utc::now();
    if let Some(new_name) = patch.name {
        sqlx::query("UPDATE projects SET name = ?, updated_at = ? WHERE id = ?")
            .bind(new_name).bind(now).bind(id)
            .execute(&state.pool).await?;
    }
    if let Some(new_state) = patch.state {
        sqlx::query("UPDATE projects SET state = ?, updated_at = ? WHERE id = ?")
            .bind(new_state).bind(now).bind(id)
            .execute(&state.pool).await?;
    }
    sqlx::query_as::<_, Project>("SELECT * FROM projects WHERE id = ?")
        .bind(id)
        .fetch_optional(&state.pool).await?
        .ok_or(AppError::NotFound { resource: "Project".into(), id })
}

#[tauri::command]
pub async fn delete_project(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    let affected = sqlx::query("DELETE FROM projects WHERE id = ?")
        .bind(id).execute(&state.pool).await?.rows_affected();
    if affected == 0 {
        return Err(AppError::NotFound { resource: "Project".into(), id });
    }
    Ok(())
}

#[tauri::command]
pub async fn discover_repos(root: String, max_depth: u32) -> AppResult<Vec<DiscoveredRepo>> {
    let path = std::path::PathBuf::from(&root);
    if !path.is_dir() {
        return Err(AppError::Validation {
            field: "root".into(),
            message: format!("{root} is not a directory"),
        });
    }
    Ok(walk_for_repos(&path, max_depth as usize))
}

#[tauri::command]
pub async fn bulk_add_projects(state: State<'_, AppState>, items: Vec<BulkAddItem>) -> AppResult<Vec<Project>> {
    let mut out = Vec::with_capacity(items.len());
    let now = Utc::now();
    for it in items {
        if !std::path::Path::new(&it.path).join(".git").exists() {
            continue; // silently skip non-git paths
        }
        let row: Result<Project, _> = sqlx::query_as(
            "INSERT INTO projects (name, path, state, created_at, updated_at)
             VALUES (?, ?, 'active', ?, ?) RETURNING *"
        )
        .bind(&it.name).bind(&it.path).bind(now).bind(now)
        .fetch_one(&state.pool).await;
        if let Ok(r) = row {
            out.push(r);
        }
    }
    Ok(out)
}
