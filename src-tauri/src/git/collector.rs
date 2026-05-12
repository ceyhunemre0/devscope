use std::path::Path;
use chrono::{DateTime, TimeZone, Utc};
use git2::{DiffOptions, Repository, Sort};

use crate::error::{AppError, AppResult};
use super::{CollectedEvent, CommitPayload};

/// Walk HEAD backwards, collecting commits with author time >= `since`.
pub fn collect(repo_path: &Path, since: DateTime<Utc>) -> AppResult<Vec<CollectedEvent>> {
    if !repo_path.join(".git").exists() {
        return Err(AppError::NotAGitRepo { path: repo_path.display().to_string() });
    }
    let repo = Repository::open(repo_path)?;
    let mut walk = repo.revwalk()?;
    walk.set_sorting(Sort::TIME)?;
    walk.push_head()?;

    let mut events = Vec::new();
    for oid in walk {
        let oid = oid?;
        let commit = repo.find_commit(oid)?;
        let when = Utc.timestamp_opt(commit.time().seconds(), 0).single()
            .ok_or_else(|| AppError::Internal("invalid commit time".into()))?;
        if when < since {
            break;
        }

        let mut files_changed = Vec::new();
        let mut additions = 0u32;
        let mut deletions = 0u32;
        if commit.parent_count() > 0 {
            let parent = commit.parent(0)?;
            let mut opts = DiffOptions::new();
            let diff = repo.diff_tree_to_tree(
                Some(&parent.tree()?),
                Some(&commit.tree()?),
                Some(&mut opts),
            )?;
            diff.foreach(
                &mut |d, _| {
                    if let Some(p) = d.new_file().path().or_else(|| d.old_file().path()) {
                        files_changed.push(p.display().to_string());
                    }
                    true
                },
                None,
                None,
                Some(&mut |_, _, line| {
                    match line.origin() {
                        '+' => additions += 1,
                        '-' => deletions += 1,
                        _ => {}
                    }
                    true
                }),
            )?;
        }

        let message = commit.summary().unwrap_or("").to_string();
        let author = commit.author().email().unwrap_or("").to_string();

        events.push(CollectedEvent {
            source: "git_local".to_string(),
            r#type: "commit".to_string(),
            external_id: oid.to_string(),
            payload: CommitPayload {
                sha: oid.to_string(),
                message_summary: message,
                files_changed,
                additions,
                deletions,
                author_email: author,
            },
            occurred_at: when,
        });
    }
    Ok(events)
}
