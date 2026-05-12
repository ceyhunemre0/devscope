use chrono::{TimeZone, Utc};
use devscope_lib::prompts;
use devscope_lib::prompts::contexts::*;

fn fixture_standup() -> StandupContext {
    StandupContext {
        since: Utc.with_ymd_and_hms(2026, 5, 12, 8, 0, 0).unwrap(),
        until: Utc.with_ymd_and_hms(2026, 5, 12, 18, 0, 0).unwrap(),
        events_by_project: vec![(
            "demo".to_string(),
            vec![EventForPrompt {
                occurred_at: Utc.with_ymd_and_hms(2026, 5, 12, 10, 30, 0).unwrap(),
                payload: CommitForPrompt {
                    sha: "abc1234".into(),
                    message_summary: "add login button".into(),
                    files_changed: vec!["ui/Login.tsx".into(), "tests/login.spec.ts".into()],
                    additions: 42,
                    deletions: 3,
                    author_email: "dev@example.com".into(),
                },
            }],
        )],
    }
}

#[test]
fn standup_renders_expected_output() {
    let out = prompts::render_standup(&fixture_standup()).unwrap();
    insta::assert_snapshot!(out);
}

#[test]
fn commit_message_renders_with_examples() {
    let ctx = CommitMessageContext {
        diff: "@@ +foo".into(),
        status: " M src/foo.rs".into(),
        truncated: false,
        examples: vec![CommitExample {
            subject: "feat(x): add y".into(),
            body: Some("because z".into()),
        }],
        no_precedent: false,
    };
    let out = prompts::render_commit_message(&ctx).unwrap();
    insta::assert_snapshot!(out);
}

#[test]
fn extract_changes_renders_with_truncated_flag() {
    let ctx = ExtractChangesContext {
        diff: "@@ +foo".into(),
        status: "?? new.txt".into(),
        truncated: true,
    };
    let out = prompts::render_extract_changes(&ctx).unwrap();
    insta::assert_snapshot!(out);
}
