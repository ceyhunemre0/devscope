use std::path::Path;
use chrono::TimeZone;
use git2::{DiffFormat, DiffOptions, ErrorClass, ErrorCode, Repository, StatusOptions, Time};
use serde::Serialize;

use crate::error::{AppError, AppResult};

const DIFF_LIMIT_BYTES: usize = 256 * 1024;

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct WorkingTreeStatus {
    pub modified: u32,
    pub untracked: u32,
    pub deleted: u32,
    pub has_changes: bool,
}

pub fn working_tree_status(repo_path: &Path) -> AppResult<WorkingTreeStatus> {
    if !repo_path.join(".git").exists() {
        return Err(AppError::NotAGitRepo { path: repo_path.display().to_string() });
    }
    let repo = Repository::open(repo_path)?;
    let mut so = StatusOptions::new();
    so.include_untracked(true);
    let statuses = repo.statuses(Some(&mut so))?;
    let mut modified = 0u32;
    let mut untracked = 0u32;
    let mut deleted = 0u32;
    for entry in statuses.iter() {
        let s = entry.status();
        if s.is_wt_new() || s.is_index_new() {
            untracked += 1;
        } else if s.is_wt_modified() || s.is_index_modified() {
            modified += 1;
        } else if s.is_wt_deleted() || s.is_index_deleted() {
            deleted += 1;
        }
    }
    let has_changes = modified + untracked + deleted > 0;
    Ok(WorkingTreeStatus { modified, untracked, deleted, has_changes })
}

pub struct WorkingTreeSummary {
    pub diff: String,
    pub status: String,
    pub truncated: bool,
    pub last_commit_date: Option<chrono::DateTime<chrono::Utc>>,
}

pub fn summarize_working_tree(repo_path: &Path) -> AppResult<WorkingTreeSummary> {
    if !repo_path.join(".git").exists() {
        return Err(AppError::NotAGitRepo { path: repo_path.display().to_string() });
    }
    let repo = Repository::open(repo_path)?;

    let mut so = StatusOptions::new();
    so.include_untracked(true);
    let statuses = repo.statuses(Some(&mut so))?;
    let mut status = String::new();
    for entry in statuses.iter() {
        if let Some(p) = entry.path() {
            let code = entry.status();
            let prefix = if code.is_wt_new() {
                "??"
            } else if code.is_index_new() {
                "A "
            } else if code.is_wt_modified() || code.is_index_modified() {
                " M"
            } else if code.is_wt_deleted() || code.is_index_deleted() {
                " D"
            } else {
                " ?"
            };
            status.push_str(&format!("{prefix} {p}\n"));
        }
    }

    let mut diff_opts = DiffOptions::new();
    diff_opts.include_untracked(false);
    let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
    let diff = match head_tree {
        Some(tree) => repo.diff_tree_to_workdir(Some(&tree), Some(&mut diff_opts))?,
        None => repo.diff_tree_to_workdir(None, Some(&mut diff_opts))?,
    };

    let mut buf = String::new();
    let print_res = diff.print(DiffFormat::Patch, |_, _, line| {
        let prefix = match line.origin() { '+' | '-' | ' ' => Some(line.origin()), _ => None };
        if let Some(c) = prefix {
            buf.push(c);
        }
        buf.push_str(std::str::from_utf8(line.content()).unwrap_or(""));
        buf.len() < DIFF_LIMIT_BYTES
    });
    // Returning `false` from the callback causes git2 to surface a User-aborted
    // error; treat that case as a signal that we hit the byte limit.
    let truncated = match print_res {
        Ok(()) => buf.len() >= DIFF_LIMIT_BYTES,
        Err(e) if e.class() == ErrorClass::Callback
                  && e.code() == ErrorCode::User
                  && buf.len() >= DIFF_LIMIT_BYTES => true,
        Err(e) => return Err(e.into()),
    };
    if truncated {
        let mut cut = DIFF_LIMIT_BYTES;
        while !buf.is_char_boundary(cut) { cut -= 1; }
        buf.truncate(cut);
    }

    let last_commit_date = repo.head().ok()
        .and_then(|h| h.peel_to_commit().ok())
        .and_then(|c| {
            let t: Time = c.time();
            chrono::Utc.timestamp_opt(t.seconds(), 0).single()
        });

    Ok(WorkingTreeSummary {
        diff: buf,
        status,
        truncated,
        last_commit_date,
    })
}

pub struct CommitExample {
    pub subject: String,
    pub body: Option<String>,
}

pub fn recent_commit_examples(repo_path: &Path, n: usize) -> AppResult<Vec<CommitExample>> {
    let repo = Repository::open(repo_path)?;
    let mut walk = repo.revwalk()?;
    walk.set_sorting(git2::Sort::TIME)?;
    if walk.push_head().is_err() {
        return Ok(vec![]);
    }
    let mut out = Vec::new();
    for oid in walk.take(n) {
        let c = repo.find_commit(oid?)?;
        let subject = c.summary().unwrap_or("").to_string();
        let body = c.body().map(|b| b.trim().to_string()).filter(|s| !s.is_empty());
        out.push(CommitExample { subject, body });
    }
    Ok(out)
}
