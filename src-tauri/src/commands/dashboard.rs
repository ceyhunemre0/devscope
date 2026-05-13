use serde::Serialize;
use tauri::State;

use super::AppState;
use crate::db::models::Project;
use crate::error::AppResult;

#[derive(Serialize, specta::Type)]
pub struct DashboardData {
    pub active_projects: i64,
    pub reports_this_week: i64,
    pub recent_projects: Vec<Project>,
}

#[tauri::command]
#[specta::specta]
pub async fn get_dashboard(state: State<'_, AppState>) -> AppResult<DashboardData> {
    let active_projects: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM projects WHERE state = 'active'")
            .fetch_one(&state.pool)
            .await?;
    let reports_this_week: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM reports WHERE generated_at >= datetime('now','-7 days')",
    )
    .fetch_one(&state.pool)
    .await?;
    let recent_projects: Vec<Project> = sqlx::query_as(
        "SELECT * FROM projects WHERE state = 'active' ORDER BY last_activity_at DESC NULLS LAST LIMIT 8"
    ).fetch_all(&state.pool).await?;
    Ok(DashboardData {
        active_projects: active_projects.0,
        reports_this_week: reports_this_week.0,
        recent_projects,
    })
}
