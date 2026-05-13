use chrono::Utc;
use devscope_lib::db;
use tempfile::tempdir;

#[tokio::test]
async fn migration_creates_all_tables() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("test.db");
    let pool = db::connect(&path).await.expect("connect");

    let tables: Vec<(String,)> = sqlx::query_as(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_sqlx_%' ORDER BY name"
    )
    .fetch_all(&pool)
    .await
    .unwrap();

    let names: Vec<String> = tables.into_iter().map(|t| t.0).collect();
    assert_eq!(
        names,
        vec!["events", "llm_calls", "projects", "reports", "settings"]
    );
}

#[tokio::test]
async fn project_insert_and_fetch_roundtrip() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("test.db");
    let pool = db::connect(&path).await.unwrap();

    let now = Utc::now();
    sqlx::query(
        "INSERT INTO projects (name, path, state, created_at, updated_at) VALUES (?, ?, 'active', ?, ?)"
    )
    .bind("demo")
    .bind("/tmp/demo")
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await
    .unwrap();

    let project: devscope_lib::db::models::Project =
        sqlx::query_as("SELECT * FROM projects WHERE name = 'demo'")
            .fetch_one(&pool)
            .await
            .unwrap();

    assert_eq!(project.name, "demo");
    assert_eq!(project.path, "/tmp/demo");
    assert_eq!(project.state, "active");
}
