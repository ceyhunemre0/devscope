use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Project {
    pub id: i64,
    pub name: String,
    pub path: String,
    pub summary: Option<String>,
    pub tech_stack: Option<String>,
    pub readme_excerpt: Option<String>,
    pub last_scanned_at: Option<DateTime<Utc>>,
    pub last_activity_at: Option<DateTime<Utc>>,
    pub state: String,
    pub extra: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Event {
    pub id: i64,
    pub project_id: Option<i64>,
    pub source: String,
    pub r#type: String,
    pub external_id: Option<String>,
    pub payload: String,
    pub occurred_at: DateTime<Utc>,
    pub collected_at: DateTime<Utc>,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct LlmCall {
    pub id: i64,
    pub provider: String,
    pub model: String,
    pub purpose: String,
    pub prompt_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
    pub cost_usd: Option<f64>,
    pub duration_ms: Option<i64>,
    pub succeeded: bool,
    pub error: Option<String>,
    pub called_at: DateTime<Utc>,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Report {
    pub id: i64,
    pub project_id: Option<i64>,
    pub r#type: String,
    pub period_start: Option<DateTime<Utc>>,
    pub period_end: Option<DateTime<Utc>>,
    pub content: String,
    pub llm_call_id: Option<i64>,
    pub generated_at: DateTime<Utc>,
}
