pub mod collector;
pub mod diff;
pub mod discover;
pub mod stats;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitPayload {
    pub sha: String,
    pub message_summary: String,
    pub files_changed: Vec<String>,
    pub additions: u32,
    pub deletions: u32,
    pub author_email: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectedEvent {
    pub source: String,
    pub r#type: String,
    pub external_id: String,
    pub payload: CommitPayload,
    pub occurred_at: chrono::DateTime<chrono::Utc>,
}
