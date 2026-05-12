use chrono::{Datelike, TimeZone, Utc};
use sqlx::SqlitePool;

use crate::error::{AppError, AppResult};

pub struct BudgetGuard {
    pub monthly_usd: f64,
    pub hard_stop: bool,
}

impl BudgetGuard {
    pub async fn spent_this_month(&self, pool: &SqlitePool) -> AppResult<f64> {
        let now = Utc::now();
        let month_start = Utc.with_ymd_and_hms(now.year(), now.month(), 1, 0, 0, 0).unwrap();

        let row: (Option<f64>,) = sqlx::query_as(
            "SELECT COALESCE(SUM(cost_usd), 0.0) FROM llm_calls WHERE called_at >= ?"
        )
        .bind(month_start)
        .fetch_one(pool)
        .await?;
        Ok(row.0.unwrap_or(0.0))
    }

    pub async fn check(&self, pool: &SqlitePool) -> AppResult<()> {
        if !self.hard_stop {
            return Ok(());
        }
        let spent = self.spent_this_month(pool).await?;
        if spent >= self.monthly_usd {
            return Err(AppError::BudgetExhausted {
                spent_usd: spent,
                limit_usd: self.monthly_usd,
            });
        }
        Ok(())
    }
}
