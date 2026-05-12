use chrono::{DateTime, Utc};
use serde::Serialize;

#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "kind", content = "detail")]
pub enum AppError {
    #[error("not found: {resource} (id {id})")]
    NotFound { resource: String, id: i64 },

    #[error("validation failed on field {field}: {message}")]
    Validation { field: String, message: String },

    #[error("path is not a git repository: {path}")]
    NotAGitRepo { path: String },

    #[error("provider {provider} failed: {message}")]
    LlmProvider { provider: String, message: String },

    #[error("monthly LLM budget exhausted ({spent_usd:.2} / {limit_usd:.2})")]
    BudgetExhausted { spent_usd: f64, limit_usd: f64 },

    #[error("github auth required")]
    GithubAuthRequired,

    #[error("github rate limited until {reset_at}")]
    GithubRateLimited { reset_at: DateTime<Utc> },

    #[error("io: {0}")]
    Io(String),

    #[error("database: {0}")]
    Db(String),

    #[error("git: {0}")]
    Git(String),

    #[error("http: {0}")]
    Http(String),

    #[error("template: {0}")]
    Template(String),

    #[error("internal: {0}")]
    Internal(String),
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self { Self::Io(e.to_string()) }
}
impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self { Self::Db(e.to_string()) }
}
impl From<sqlx::migrate::MigrateError> for AppError {
    fn from(e: sqlx::migrate::MigrateError) -> Self { Self::Db(e.to_string()) }
}
impl From<git2::Error> for AppError {
    fn from(e: git2::Error) -> Self { Self::Git(e.to_string()) }
}
impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self { Self::Http(e.to_string()) }
}
impl From<tera::Error> for AppError {
    fn from(e: tera::Error) -> Self { Self::Template(e.to_string()) }
}
impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self { Self::Internal(e.to_string()) }
}
impl From<toml::de::Error> for AppError {
    fn from(e: toml::de::Error) -> Self { Self::Internal(format!("toml: {e}")) }
}
impl From<toml::ser::Error> for AppError {
    fn from(e: toml::ser::Error) -> Self { Self::Internal(format!("toml: {e}")) }
}

pub type AppResult<T> = Result<T, AppError>;
