use async_trait::async_trait;
use serde_json::json;
use std::time::Instant;

use super::{LlmProvider, LlmRequest, LlmResponse};
use crate::error::{AppError, AppResult};

pub struct OpenAIProvider {
    pub api_key: String,
    pub client: reqwest::Client,
}

impl OpenAIProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(120))
                .build()
                .expect("reqwest client"),
        }
    }

    fn price_per_million(model: &str) -> Option<(f64, f64)> {
        match model {
            "gpt-4o-mini" => Some((0.150, 0.600)),
            "gpt-4o" => Some((2.500, 10.000)),
            _ => None,
        }
    }
}

#[async_trait]
impl LlmProvider for OpenAIProvider {
    fn name(&self) -> &'static str {
        "openai"
    }

    async fn call(&self, req: &LlmRequest) -> AppResult<LlmResponse> {
        let started = Instant::now();
        let resp = self
            .client
            .post("https://api.openai.com/v1/chat/completions")
            .bearer_auth(&self.api_key)
            .json(&json!({
                "model": req.model,
                "messages": [{"role": "user", "content": req.prompt}],
            }))
            .send()
            .await
            .map_err(|e| AppError::LlmProvider {
                provider: "openai".into(),
                message: e.to_string(),
            })?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::LlmProvider {
                provider: "openai".into(),
                message: format!("HTTP {status}: {body}"),
            });
        }
        let v: serde_json::Value = resp.json().await?;
        let content = v
            .pointer("/choices/0/message/content")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        let pt = v.pointer("/usage/prompt_tokens").and_then(|x| x.as_i64());
        let ot = v
            .pointer("/usage/completion_tokens")
            .and_then(|x| x.as_i64());
        let cost = Self::price_per_million(&req.model).map(|(in_p, out_p)| {
            pt.unwrap_or(0) as f64 / 1_000_000.0 * in_p
                + ot.unwrap_or(0) as f64 / 1_000_000.0 * out_p
        });
        if cost.is_none() {
            log::warn!(
                "no pricing entry for openai model {} — cost will not contribute to budget tracking",
                req.model
            );
        }
        Ok(LlmResponse {
            content,
            prompt_tokens: pt,
            output_tokens: ot,
            cost_usd: cost,
            duration_ms: started.elapsed().as_millis() as i64,
            model: req.model.clone(),
            provider: "openai".into(),
        })
    }
}
