use std::time::Instant;
use serde_json::json;
use async_trait::async_trait;

use crate::error::{AppError, AppResult};
use super::{LlmProvider, LlmRequest, LlmResponse};

pub struct OllamaProvider {
    pub base_url: String,
    pub client: reqwest::Client,
}

impl Default for OllamaProvider {
    fn default() -> Self {
        Self {
            base_url: std::env::var("OLLAMA_BASE_URL")
                .unwrap_or_else(|_| "http://127.0.0.1:11434".to_string()),
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(120))
                .build()
                .expect("reqwest client"),
        }
    }
}

#[async_trait]
impl LlmProvider for OllamaProvider {
    fn name(&self) -> &'static str { "ollama" }

    async fn call(&self, req: &LlmRequest) -> AppResult<LlmResponse> {
        let started = Instant::now();
        let resp = self.client
            .post(format!("{}/api/generate", self.base_url))
            .json(&json!({
                "model": req.model,
                "prompt": req.prompt,
                "stream": false,
            }))
            .send()
            .await
            .map_err(|e| AppError::LlmProvider { provider: "ollama".into(), message: e.to_string() })?;

        if !resp.status().is_success() {
            return Err(AppError::LlmProvider {
                provider: "ollama".into(),
                message: format!("HTTP {}", resp.status()),
            });
        }
        let v: serde_json::Value = resp.json().await?;
        let content = v.get("response").and_then(|x| x.as_str()).unwrap_or("").to_string();
        let duration_ms = started.elapsed().as_millis() as i64;
        Ok(LlmResponse {
            content,
            prompt_tokens: v.get("prompt_eval_count").and_then(|x| x.as_i64()),
            output_tokens: v.get("eval_count").and_then(|x| x.as_i64()),
            cost_usd: Some(0.0),
            duration_ms,
            model: req.model.clone(),
            provider: "ollama".into(),
        })
    }
}
