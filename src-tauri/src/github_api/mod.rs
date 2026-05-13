pub mod client;
pub mod clone;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct GithubUser {
    pub login: String,
    pub avatar_url: String,
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct GithubRepo {
    pub full_name: String,
    pub name: String,
    pub clone_url: String,
    pub private: bool,
    pub default_branch: String,
    pub description: Option<String>,
}
