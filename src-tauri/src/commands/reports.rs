use chrono::{Duration, Utc};
use serde::Deserialize;
use std::collections::HashMap;
use tauri::{Emitter, State, Window};

use crate::config;
use crate::db::models::{Project, Report};
use crate::error::{AppError, AppResult};
use crate::git::collector;
use crate::llm::{LlmProvider, LlmRequest, budget::BudgetGuard, ollama::OllamaProvider,
                 openai::OpenAIProvider, router::LlmRouter};
use crate::prompts;
use crate::prompts::contexts::{CommitForPrompt, EventForPrompt, StandupContext};
use crate::secrets;
use super::AppState;

#[derive(Deserialize, specta::Type)]
pub struct ReportFilter {
    pub r#type: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Deserialize, specta::Type)]
pub struct RunTodayArgs {
    pub since_hours: i64,
    pub provider: String,        // "auto" | "openai" | "ollama"
    pub project_id: Option<i64>, // None => all active
}

#[tauri::command]
#[specta::specta]
pub async fn list_reports(state: State<'_, AppState>, filter: Option<ReportFilter>) -> AppResult<Vec<Report>> {
    let f = filter.unwrap_or(ReportFilter { r#type: None, limit: Some(50) });
    let limit = f.limit.unwrap_or(50);
    let rows = match f.r#type {
        Some(t) => sqlx::query_as::<_, Report>(
            "SELECT * FROM reports WHERE type = ? ORDER BY generated_at DESC LIMIT ?"
        ).bind(t).bind(limit).fetch_all(&state.pool).await?,
        None => sqlx::query_as::<_, Report>(
            "SELECT * FROM reports ORDER BY generated_at DESC LIMIT ?"
        ).bind(limit).fetch_all(&state.pool).await?,
    };
    Ok(rows)
}

#[tauri::command]
#[specta::specta]
pub async fn get_report(state: State<'_, AppState>, id: i64) -> AppResult<Report> {
    sqlx::query_as::<_, Report>("SELECT * FROM reports WHERE id = ?")
        .bind(id)
        .fetch_optional(&state.pool).await?
        .ok_or(AppError::NotFound { resource: "Report".into(), id })
}

#[tauri::command]
#[specta::specta]
pub async fn run_today(state: State<'_, AppState>, window: Window, args: RunTodayArgs) -> AppResult<Report> {
    window.emit("standup:progress", "loading config").ok();
    let cfg = config::load()?;

    let since = Utc::now() - Duration::hours(args.since_hours);
    let until = Utc::now();

    let projects: Vec<Project> = match args.project_id {
        Some(id) => {
            let p = sqlx::query_as::<_, Project>("SELECT * FROM projects WHERE id = ?")
                .bind(id).fetch_optional(&state.pool).await?
                .ok_or(AppError::NotFound { resource: "Project".into(), id })?;
            vec![p]
        }
        None => sqlx::query_as::<_, Project>(
            "SELECT * FROM projects WHERE state = 'active'"
        ).fetch_all(&state.pool).await?,
    };

    window.emit("standup:progress", "collecting commits").ok();
    let mut events_by_project: HashMap<String, Vec<EventForPrompt>> = HashMap::new();
    for p in &projects {
        let path = std::path::Path::new(&p.path);
        if !path.join(".git").exists() { continue; }
        let collected = collector::collect(path, since)?;
        if collected.is_empty() { continue; }
        let mapped: Vec<EventForPrompt> = collected.into_iter().map(|c| EventForPrompt {
            occurred_at: c.occurred_at,
            payload: CommitForPrompt {
                sha: c.payload.sha,
                message_summary: c.payload.message_summary,
                files_changed: c.payload.files_changed,
                additions: c.payload.additions,
                deletions: c.payload.deletions,
                author_email: c.payload.author_email,
            },
        }).collect();
        events_by_project.insert(p.name.clone(), mapped);
    }

    if events_by_project.is_empty() {
        return Err(AppError::Validation {
            field: "events".into(),
            message: "no commits in the selected window".into(),
        });
    }

    window.emit("standup:progress", "rendering prompt").ok();
    let ctx = StandupContext {
        since,
        until,
        events_by_project: events_by_project.into_iter().collect(),
    };
    let prompt = prompts::render_standup(&ctx)?;

    window.emit("standup:progress", "calling llm").ok();
    let (resp, llm_call_id) = invoke_llm(&state.pool, &cfg, &args.provider, "standup", &prompt).await?;

    window.emit("standup:progress", "saving report").ok();
    let now = Utc::now();
    let report: Report = sqlx::query_as(
        "INSERT INTO reports (project_id, type, period_start, period_end, content, llm_call_id, generated_at)
         VALUES (?, 'standup', ?, ?, ?, ?, ?) RETURNING *"
    )
    .bind(args.project_id).bind(since).bind(until)
    .bind(&resp.content).bind(llm_call_id).bind(now)
    .fetch_one(&state.pool).await?;
    Ok(report)
}

pub async fn invoke_llm(
    pool: &sqlx::SqlitePool,
    cfg: &crate::config::Settings,
    requested: &str,
    purpose: &str,
    prompt: &str,
) -> AppResult<(crate::llm::LlmResponse, i64)> {
    let has_openai_key = secrets::get("OPENAI_API_KEY")?.is_some();
    let provider = match requested {
        "auto" if has_openai_key => "openai",
        "auto" => "ollama",
        other => other,
    };
    let chain: Vec<Box<dyn LlmProvider>> = match provider {
        "openai" => {
            let key = secrets::get("OPENAI_API_KEY")?.ok_or(AppError::Validation {
                field: "OPENAI_API_KEY".into(),
                message: "missing key".into(),
            })?;
            vec![Box::new(OpenAIProvider::new(key))]
        }
        "ollama" => vec![Box::new(OllamaProvider::default())],
        other => return Err(AppError::Validation {
            field: "provider".into(),
            message: format!("unknown provider: {other}"),
        }),
    };
    let model = match provider {
        "openai" => cfg.llm.default_model.openai.clone(),
        _        => cfg.llm.default_model.ollama.clone(),
    };
    let router = LlmRouter {
        chain,
        guard: BudgetGuard {
            monthly_usd: cfg.llm.budget.monthly_usd,
            hard_stop: cfg.llm.budget.hard_stop,
        },
    };
    router.call(pool, &LlmRequest {
        model,
        prompt: prompt.to_string(),
        purpose: purpose.to_string(),
    }).await
}
