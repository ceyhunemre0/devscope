use chrono::Utc;
use sqlx::SqlitePool;

use super::{budget::BudgetGuard, LlmProvider, LlmRequest, LlmResponse};
use crate::error::{AppError, AppResult};

pub struct LlmRouter {
    pub chain: Vec<Box<dyn LlmProvider>>,
    pub guard: BudgetGuard,
}

impl LlmRouter {
    pub async fn call(&self, pool: &SqlitePool, req: &LlmRequest) -> AppResult<(LlmResponse, i64)> {
        self.guard.check(pool).await?;

        let mut last_err: Option<AppError> = None;
        for provider in &self.chain {
            match provider.call(req).await {
                Ok(resp) => {
                    let row: (i64,) = sqlx::query_as(
                        "INSERT INTO llm_calls
                         (provider, model, purpose, prompt_tokens, output_tokens, cost_usd, duration_ms, succeeded, error, called_at)
                         VALUES (?,?,?,?,?,?,?,1,NULL,?) RETURNING id"
                    )
                    .bind(&resp.provider)
                    .bind(&resp.model)
                    .bind(&req.purpose)
                    .bind(resp.prompt_tokens)
                    .bind(resp.output_tokens)
                    .bind(resp.cost_usd)
                    .bind(resp.duration_ms)
                    .bind(Utc::now())
                    .fetch_one(pool)
                    .await?;
                    return Ok((resp, row.0));
                }
                Err(e) => {
                    if let Err(db_err) = sqlx::query(
                        "INSERT INTO llm_calls
                         (provider, model, purpose, succeeded, error, called_at)
                         VALUES (?,?,?,0,?,?)",
                    )
                    .bind(provider.name())
                    .bind(&req.model)
                    .bind(&req.purpose)
                    .bind(e.to_string())
                    .bind(Utc::now())
                    .execute(pool)
                    .await
                    {
                        log::warn!(
                            "failed to record llm_calls failure row for provider {}: {db_err}",
                            provider.name()
                        );
                    }
                    last_err = Some(e);
                }
            }
        }
        Err(last_err.unwrap_or(AppError::Internal("empty provider chain".into())))
    }
}
