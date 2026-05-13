use chrono::{TimeZone, Utc};
use serde::Serialize;

use crate::error::{AppError, AppResult};
use super::{GithubRepo, GithubUser};

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct ContributionDay {
    pub date: String, // YYYY-MM-DD
    pub count: u32,
    pub level: u8, // 0..=4 intensity
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct GithubContributions {
    pub days: Vec<ContributionDay>,
    pub total: u32,
}

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

    pub async fn contributions(
        &self,
        login: &str,
        since: chrono::DateTime<chrono::Utc>,
        until: chrono::DateTime<chrono::Utc>,
    ) -> AppResult<GithubContributions> {
        // GraphQL: user(login).contributionsCollection(from, to).contributionCalendar.weeks[].contributionDays
        let query = r#"
        query($login: String!, $from: DateTime!, $to: DateTime!) {
          user(login: $login) {
            contributionsCollection(from: $from, to: $to) {
              contributionCalendar {
                totalContributions
                weeks { contributionDays { date contributionCount contributionLevel } }
              }
            }
          }
        }"#;
        let body = serde_json::json!({
            "query": query,
            "variables": {
                "login": login,
                "from": since.to_rfc3339(),
                "to": until.to_rfc3339(),
            }
        });
        let resp = self.client
            .post("https://api.github.com/graphql")
            .bearer_auth(&self.token)
            .json(&body)
            .send().await?;
        if resp.status() == 401 {
            return Err(AppError::GithubAuthRequired);
        }
        Self::check_rate_limit(&resp)?;
        let resp = resp.error_for_status()?;
        let v: serde_json::Value = resp.json().await?;
        let cal = v
            .pointer("/data/user/contributionsCollection/contributionCalendar")
            .ok_or_else(|| AppError::Internal("graphql: missing contributionCalendar".into()))?;
        let total = cal
            .pointer("/totalContributions")
            .and_then(|x| x.as_u64())
            .unwrap_or(0) as u32;
        let weeks = cal
            .pointer("/weeks")
            .and_then(|x| x.as_array())
            .ok_or_else(|| AppError::Internal("graphql: missing weeks".into()))?;
        let mut days = Vec::new();
        for w in weeks {
            let arr = w.pointer("/contributionDays").and_then(|x| x.as_array());
            if let Some(arr) = arr {
                for d in arr {
                    let date = d
                        .pointer("/date")
                        .and_then(|x| x.as_str())
                        .unwrap_or("")
                        .to_string();
                    let count = d
                        .pointer("/contributionCount")
                        .and_then(|x| x.as_u64())
                        .unwrap_or(0) as u32;
                    let level_str = d
                        .pointer("/contributionLevel")
                        .and_then(|x| x.as_str())
                        .unwrap_or("NONE");
                    let level = match level_str {
                        "NONE" => 0u8,
                        "FIRST_QUARTILE" => 1,
                        "SECOND_QUARTILE" => 2,
                        "THIRD_QUARTILE" => 3,
                        "FOURTH_QUARTILE" => 4,
                        _ => 0,
                    };
                    days.push(ContributionDay { date, count, level });
                }
            }
        }
        Ok(GithubContributions { days, total })
    }
}
