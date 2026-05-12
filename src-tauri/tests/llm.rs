use async_trait::async_trait;
use chrono::Utc;
use devscope_lib::db::connect;
use devscope_lib::llm::{
    budget::BudgetGuard, router::LlmRouter, LlmProvider, LlmRequest, LlmResponse,
};
use tempfile::tempdir;

#[tokio::test]
async fn budget_blocks_when_spent_exceeds_limit() {
    let dir = tempdir().unwrap();
    let pool = connect(&dir.path().join("db.sqlite")).await.unwrap();

    sqlx::query(
        "INSERT INTO llm_calls (provider, model, purpose, cost_usd, succeeded, called_at) VALUES (?,?,?,?,1,?)"
    )
    .bind("openai").bind("gpt-4o-mini").bind("standup").bind(25.0).bind(Utc::now())
    .execute(&pool).await.unwrap();

    let guard = BudgetGuard { monthly_usd: 20.0, hard_stop: true };
    let err = guard.check(&pool).await.unwrap_err();
    assert!(matches!(err, devscope_lib::error::AppError::BudgetExhausted { .. }));
}

#[tokio::test]
async fn budget_passes_when_hard_stop_disabled() {
    let dir = tempdir().unwrap();
    let pool = connect(&dir.path().join("db.sqlite")).await.unwrap();

    sqlx::query(
        "INSERT INTO llm_calls (provider, model, purpose, cost_usd, succeeded, called_at) VALUES (?,?,?,?,1,?)"
    )
    .bind("openai").bind("gpt-4o-mini").bind("standup").bind(999.0).bind(Utc::now())
    .execute(&pool).await.unwrap();

    let guard = BudgetGuard { monthly_usd: 1.0, hard_stop: false };
    guard.check(&pool).await.expect("hard_stop=false must not block");
}

struct StubOk;
#[async_trait]
impl LlmProvider for StubOk {
    fn name(&self) -> &'static str { "stub" }
    async fn call(&self, req: &LlmRequest) -> devscope_lib::error::AppResult<LlmResponse> {
        Ok(LlmResponse {
            content: format!("echo: {}", req.prompt),
            prompt_tokens: Some(10),
            output_tokens: Some(20),
            cost_usd: Some(0.001),
            duration_ms: 5,
            model: req.model.clone(),
            provider: "stub".into(),
        })
    }
}

#[tokio::test]
async fn router_records_successful_call_in_llm_calls() {
    let dir = tempdir().unwrap();
    let pool = connect(&dir.path().join("db.sqlite")).await.unwrap();

    let router = LlmRouter {
        chain: vec![Box::new(StubOk)],
        guard: BudgetGuard { monthly_usd: 100.0, hard_stop: true },
    };
    let req = LlmRequest {
        model: "test".into(),
        prompt: "hello".into(),
        purpose: "standup".into(),
    };
    let (resp, id) = router.call(&pool, &req).await.unwrap();
    assert_eq!(resp.content, "echo: hello");

    let row: (String, i64) = sqlx::query_as("SELECT provider, succeeded FROM llm_calls WHERE id = ?")
        .bind(id)
        .fetch_one(&pool).await.unwrap();
    assert_eq!(row.0, "stub");
    assert_eq!(row.1, 1);
}
