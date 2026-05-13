use serde::{Deserialize, Serialize};
use tauri::{Emitter, State, Window};

use crate::config;
use crate::error::{AppError, AppResult};
use crate::git::diff::{recent_commit_examples, summarize_working_tree, WorkingTreeSummary};
use crate::prompts;
use crate::prompts::contexts::{CommitExample, CommitMessageContext};
use super::AppState;

#[derive(Serialize, specta::Type)]
pub struct CommitContext {
    pub status: String,
    pub diff_preview: String,
    pub truncated: bool,
    pub last_commit_date: Option<chrono::DateTime<chrono::Utc>>,
    pub examples_count: usize,
}

#[tauri::command]
#[specta::specta]
pub async fn get_commit_context(state: State<'_, AppState>, project_id: i64) -> AppResult<CommitContext> {
    let row: (String,) = sqlx::query_as("SELECT path FROM projects WHERE id = ?")
        .bind(project_id)
        .fetch_optional(&state.pool).await?
        .ok_or(AppError::NotFound { resource: "Project".into(), id: project_id })?;
    let p = std::path::Path::new(&row.0);
    let WorkingTreeSummary { diff, status, truncated, last_commit_date } =
        summarize_working_tree(p)?;
    let examples = recent_commit_examples(p, 6)?;
    Ok(CommitContext {
        status,
        diff_preview: diff.chars().take(2000).collect(),
        truncated,
        last_commit_date,
        examples_count: examples.len(),
    })
}

#[derive(Deserialize, specta::Type)]
pub struct GenerateCommitArgs {
    pub project_id: i64,
    pub provider: String,
}

#[derive(Serialize, specta::Type)]
pub struct CommitResult {
    pub message: String,
    pub llm_call_id: i64,
}

#[tauri::command]
#[specta::specta]
pub async fn generate_commit_message(
    state: State<'_, AppState>,
    window: Window,
    args: GenerateCommitArgs,
) -> AppResult<CommitResult> {
    let row: (String,) = sqlx::query_as("SELECT path FROM projects WHERE id = ?")
        .bind(args.project_id)
        .fetch_optional(&state.pool).await?
        .ok_or(AppError::NotFound { resource: "Project".into(), id: args.project_id })?;
    let p = std::path::Path::new(&row.0);

    window.emit("commit:progress", "scanning working tree").ok();
    let WorkingTreeSummary { diff, status, truncated, .. } = summarize_working_tree(p)?;
    if diff.trim().is_empty() && status.trim().is_empty() {
        return Err(AppError::Validation {
            field: "diff".into(),
            message: "no changes to summarize".into(),
        });
    }
    let examples_raw = recent_commit_examples(p, 6)?;
    let examples: Vec<CommitExample> = examples_raw.into_iter().map(|e| CommitExample {
        subject: e.subject,
        body: e.body,
    }).collect();
    let no_precedent = examples.is_empty();
    let ctx = CommitMessageContext { diff, status, truncated, examples, no_precedent };

    window.emit("commit:progress", "rendering prompt").ok();
    let prompt = prompts::render_commit_message(&ctx)?;

    window.emit("commit:progress", "calling llm").ok();
    let cfg = config::load()?;
    let (resp, llm_call_id) = super::reports::invoke_llm(
        &state.pool, &cfg, &args.provider, "commit_message", &prompt,
    ).await?;
    Ok(CommitResult {
        message: resp.content.trim().to_string(),
        llm_call_id,
    })
}
