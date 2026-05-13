use chrono::{DateTime, Duration, Utc};
use serde::Serialize;
use tauri::State;

use crate::error::AppResult;
use crate::git::collector::collect;
use crate::git::stats::{daily_commit_counts, DailyCount};
use super::AppState;

#[derive(Serialize, specta::Type)]
pub struct StatsData {
    pub days: Vec<DayBucket>,
}

#[derive(Serialize, specta::Type)]
pub struct DayBucket {
    pub date: String,
    pub count: u32,
}

#[tauri::command]
#[specta::specta]
pub async fn get_stats(state: State<'_, AppState>, range_days: u32) -> AppResult<StatsData> {
    let since = Utc::now() - Duration::days(range_days as i64);
    let until = Utc::now();
    let projects: Vec<(String,)> = sqlx::query_as(
        "SELECT path FROM projects WHERE state = 'active'"
    ).fetch_all(&state.pool).await?;

    let mut totals: std::collections::BTreeMap<chrono::NaiveDate, u32> = std::collections::BTreeMap::new();
    for (path,) in projects {
        let p = std::path::Path::new(&path);
        if !p.join(".git").exists() { continue; }
        if let Ok(daily) = daily_commit_counts(p, since, until) {
            for DailyCount { date, count } in daily {
                *totals.entry(date).or_insert(0) += count;
            }
        }
    }
    Ok(StatsData {
        days: totals.into_iter()
            .map(|(date, count)| DayBucket { date: date.to_string(), count })
            .collect(),
    })
}

#[derive(Serialize, specta::Type)]
pub struct CommitListItem {
    pub project_id: i64,
    pub project_name: String,
    pub sha: String,
    pub message: String,
    pub author_email: String,
    pub occurred_at: DateTime<Utc>,
    pub additions: u32,
    pub deletions: u32,
    pub files_changed: u32,
}

#[tauri::command]
#[specta::specta]
pub async fn list_recent_commits(
    state: State<'_, AppState>,
    since_days: u32,
    project_id: Option<i64>,
) -> AppResult<Vec<CommitListItem>> {
    let since = Utc::now() - Duration::days(since_days as i64);

    let projects: Vec<(i64, String, String)> = match project_id {
        Some(id) => sqlx::query_as(
            "SELECT id, name, path FROM projects WHERE id = ?",
        )
        .bind(id)
        .fetch_all(&state.pool)
        .await?,
        None => sqlx::query_as(
            "SELECT id, name, path FROM projects WHERE state = 'active'",
        )
        .fetch_all(&state.pool)
        .await?,
    };

    let mut out: Vec<CommitListItem> = Vec::new();
    for (id, name, path) in projects {
        let p = std::path::Path::new(&path);
        if !p.join(".git").exists() {
            continue;
        }
        let Ok(events) = collect(p, since) else {
            continue;
        };
        for ev in events {
            out.push(CommitListItem {
                project_id: id,
                project_name: name.clone(),
                sha: ev.payload.sha,
                message: ev.payload.message_summary,
                author_email: ev.payload.author_email,
                occurred_at: ev.occurred_at,
                additions: ev.payload.additions,
                deletions: ev.payload.deletions,
                files_changed: ev.payload.files_changed.len() as u32,
            });
        }
    }
    out.sort_by(|a, b| b.occurred_at.cmp(&a.occurred_at));
    Ok(out)
}
