use serde::{Deserialize, Serialize};
use tauri::State;

use super::AppState;
use crate::db::models::Project;
use crate::error::{AppError, AppResult};
use crate::github_api::{
    client::{GithubClient, GithubContributions},
    clone::clone_with_token,
    GithubRepo, GithubUser,
};
use crate::secrets;

#[derive(Serialize, specta::Type)]
pub struct GithubStatus {
    pub configured: bool,
    pub user: Option<GithubUser>,
}

#[tauri::command]
#[specta::specta]
pub async fn github_status() -> AppResult<GithubStatus> {
    let token = secrets::get("GITHUB_TOKEN")?;
    let Some(token) = token else {
        return Ok(GithubStatus {
            configured: false,
            user: None,
        });
    };
    let user = GithubClient::new(token).me().await.ok();
    Ok(GithubStatus {
        configured: true,
        user,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn set_github_token(token: String) -> AppResult<GithubStatus> {
    if token.trim().is_empty() {
        secrets::delete("GITHUB_TOKEN")?;
        return Ok(GithubStatus {
            configured: false,
            user: None,
        });
    }
    let user = GithubClient::new(token.clone()).me().await?;
    secrets::set("GITHUB_TOKEN", &token)?;
    Ok(GithubStatus {
        configured: true,
        user: Some(user),
    })
}

#[tauri::command]
#[specta::specta]
pub async fn list_github_repos() -> AppResult<Vec<GithubRepo>> {
    let token = secrets::get("GITHUB_TOKEN")?.ok_or(AppError::GithubAuthRequired)?;
    GithubClient::new(token).list_repos(50).await
}

#[derive(Deserialize, specta::Type)]
pub struct CloneArgs {
    pub clone_url: String,
    pub dest_path: String,
    pub name: String,
}

#[tauri::command]
#[specta::specta]
pub async fn clone_github_repo(state: State<'_, AppState>, args: CloneArgs) -> AppResult<Project> {
    let token = secrets::get("GITHUB_TOKEN")?;
    let dest = std::path::PathBuf::from(&args.dest_path);
    clone_with_token(&args.clone_url, &dest, token.as_deref())?;

    let gh = crate::git::remote::github_full_name(&dest);
    let now = chrono::Utc::now();
    let row: Result<Project, sqlx::Error> = sqlx::query_as(
        "INSERT INTO projects (name, path, github_full_name, state, created_at, updated_at)
         VALUES (?, ?, ?, 'active', ?, ?) RETURNING *",
    )
    .bind(&args.name)
    .bind(&args.dest_path)
    .bind(&gh)
    .bind(now)
    .bind(now)
    .fetch_one(&state.pool)
    .await;

    match row {
        Ok(project) => Ok(project),
        Err(e) => {
            // Roll back the clone on disk so we don't leave an orphan directory.
            let _ = std::fs::remove_dir_all(&dest);
            Err(e.into())
        }
    }
}

#[derive(Deserialize, specta::Type)]
pub struct ContributionsArgs {
    pub login: String,
    pub since_days: u32,
}

#[tauri::command]
#[specta::specta]
pub async fn github_contributions(args: ContributionsArgs) -> AppResult<GithubContributions> {
    let token = secrets::get("GITHUB_TOKEN")?.ok_or(AppError::GithubAuthRequired)?;
    let now = chrono::Utc::now();
    let since = now - chrono::Duration::days(args.since_days as i64);
    GithubClient::new(token)
        .contributions(&args.login, since, now)
        .await
}
