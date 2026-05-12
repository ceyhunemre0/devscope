use chrono::{TimeZone, Utc};

use crate::error::{AppError, AppResult};
use super::{GithubRepo, GithubUser};

pub struct GithubClient {
    pub token: String,
    pub client: reqwest::Client,
}

impl GithubClient {
    pub fn new(token: String) -> Self {
        Self {
            token,
            client: reqwest::Client::builder()
                .user_agent("devscope/0.1")
                .build()
                .expect("reqwest client"),
        }
    }

    fn check_rate_limit(resp: &reqwest::Response) -> AppResult<()> {
        if resp.status().as_u16() == 403 {
            if let Some(reset) = resp.headers().get("x-ratelimit-reset")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse::<i64>().ok())
            {
                let when = Utc.timestamp_opt(reset, 0).single().unwrap_or_else(Utc::now);
                return Err(AppError::GithubRateLimited { reset_at: when });
            }
        }
        Ok(())
    }

    pub async fn me(&self) -> AppResult<GithubUser> {
        let resp = self.client
            .get("https://api.github.com/user")
            .bearer_auth(&self.token)
            .header("Accept", "application/vnd.github+json")
            .send().await?;
        Self::check_rate_limit(&resp)?;
        if resp.status() == 401 {
            return Err(AppError::GithubAuthRequired);
        }
        let user: GithubUser = resp.error_for_status()?.json().await?;
        Ok(user)
    }

    pub async fn list_repos(&self, per_page: u32) -> AppResult<Vec<GithubRepo>> {
        let mut out = Vec::new();
        let mut page: u32 = 1;
        loop {
            let resp = self.client
                .get("https://api.github.com/user/repos")
                .bearer_auth(&self.token)
                .header("Accept", "application/vnd.github+json")
                .query(&[
                    ("per_page", per_page.to_string()),
                    ("page", page.to_string()),
                    ("sort", "updated".to_string()),
                ])
                .send().await?;
            Self::check_rate_limit(&resp)?;
            if resp.status() == 401 {
                return Err(AppError::GithubAuthRequired);
            }
            let batch: Vec<GithubRepo> = resp.error_for_status()?.json().await?;
            let batch_len = batch.len();
            out.extend(batch);
            if batch_len < per_page as usize {
                break;
            }
            page += 1;
            if page > 20 { break; }
        }
        Ok(out)
    }
}
