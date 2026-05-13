use chrono::{DateTime, Utc};
use serde::Serialize;

#[derive(Serialize)]
pub struct CommitForPrompt {
    pub sha: String,
    pub message_summary: String,
    pub files_changed: Vec<String>,
    pub additions: u32,
    pub deletions: u32,
    pub author_email: String,
}

#[derive(Serialize)]
pub struct EventForPrompt {
    pub occurred_at: DateTime<Utc>,
    pub payload: CommitForPrompt,
}

#[derive(Serialize)]
pub struct StandupContext {
    pub since: DateTime<Utc>,
    pub until: DateTime<Utc>,
    pub events_by_project: Vec<(String, Vec<EventForPrompt>)>,
}

#[derive(Serialize)]
pub struct CommitExample {
    pub subject: String,
    pub body: Option<String>,
}

#[derive(Serialize)]
pub struct CommitMessageContext {
    pub diff: String,
    pub status: String,
    pub truncated: bool,
    pub examples: Vec<CommitExample>,
    pub no_precedent: bool,
}

#[derive(Serialize)]
pub struct ExtractChangesContext {
    pub diff: String,
    pub status: String,
    pub truncated: bool,
}
