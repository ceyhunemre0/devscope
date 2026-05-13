use chrono::{Duration, Utc};
use serde::Serialize;
use tauri::State;

use crate::error::AppResult;
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
