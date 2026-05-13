use std::path::Path;
use chrono::{DateTime, TimeZone, Utc};
use git2::{Repository, Sort};
use std::collections::BTreeMap;

use crate::error::AppResult;

pub struct DailyCount {
    pub date: chrono::NaiveDate,
    pub count: u32,
}

pub fn daily_commit_counts(
    repo_path: &Path,
    since: DateTime<Utc>,
    until: DateTime<Utc>,
) -> AppResult<Vec<DailyCount>> {
    let repo = Repository::open(repo_path)?;
    let mut walk = repo.revwalk()?;
    walk.set_sorting(Sort::TIME | Sort::TOPOLOGICAL)?;
    walk.push_head()?;

    let mut bucket: BTreeMap<chrono::NaiveDate, u32> = BTreeMap::new();
    for oid in walk {
        let oid = oid?;
        let commit = repo.find_commit(oid)?;
        let when = Utc.timestamp_opt(commit.time().seconds(), 0).single();
        let Some(when) = when else { continue };
        if when < since { break; }
        if when > until { continue; }
        let date = when.date_naive();
        *bucket.entry(date).or_insert(0) += 1;
    }
    Ok(bucket.into_iter().map(|(date, count)| DailyCount { date, count }).collect())
}
