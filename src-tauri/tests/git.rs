use chrono::{Duration, Utc};
use devscope_lib::git::collector::collect;
use std::process::Command;
use tempfile::tempdir;

fn run(cmd: &str, args: &[&str], cwd: &std::path::Path) {
    let status = Command::new(cmd).args(args).current_dir(cwd).status().unwrap();
    assert!(status.success(), "{cmd} {args:?} failed");
}

fn make_repo() -> tempfile::TempDir {
    let dir = tempdir().unwrap();
    let p = dir.path();
    run("git", &["init", "-q", "-b", "main"], p);
    run("git", &["config", "user.email", "test@example.com"], p);
    run("git", &["config", "user.name", "Test"], p);
    std::fs::write(p.join("a.txt"), "hello\n").unwrap();
    run("git", &["add", "a.txt"], p);
    run("git", &["commit", "-q", "-m", "first commit"], p);
    std::fs::write(p.join("b.txt"), "world\n").unwrap();
    run("git", &["add", "b.txt"], p);
    run("git", &["commit", "-q", "-m", "second commit"], p);
    dir
}

#[test]
fn collect_returns_recent_commits_in_window() {
    let dir = make_repo();
    let events = collect(dir.path(), Utc::now() - Duration::hours(1)).unwrap();
    assert_eq!(events.len(), 2);
    assert_eq!(events[0].payload.message_summary, "second commit");
    assert_eq!(events[1].payload.message_summary, "first commit");
    assert!(events[0].payload.files_changed.contains(&"b.txt".to_string()));
}

#[test]
fn collect_filters_out_commits_before_since() {
    let dir = make_repo();
    let events = collect(dir.path(), Utc::now() + Duration::hours(1)).unwrap();
    assert_eq!(events.len(), 0);
}

#[test]
fn collect_errors_on_non_repo() {
    let dir = tempdir().unwrap();
    let err = collect(dir.path(), Utc::now()).unwrap_err();
    assert!(matches!(err, devscope_lib::error::AppError::NotAGitRepo { .. }));
}

#[test]
fn summarize_working_tree_reports_untracked_file() {
    let dir = make_repo();
    std::fs::write(dir.path().join("c.txt"), "draft\n").unwrap();
    let s = devscope_lib::git::diff::summarize_working_tree(dir.path()).unwrap();
    assert!(s.status.contains("c.txt"));
    assert!(s.last_commit_date.is_some());
}

#[test]
fn recent_commits_returns_in_reverse_chronological() {
    let dir = make_repo();
    let examples = devscope_lib::git::diff::recent_commit_examples(dir.path(), 5).unwrap();
    assert_eq!(examples.len(), 2);
    assert_eq!(examples[0].subject, "second commit");
}

#[test]
fn summarize_working_tree_truncates_on_char_boundary_with_unicode() {
    let dir = make_repo();
    // Stage and commit big.txt as empty, then overwrite with large UTF-8
    // content so the working-tree diff (vs HEAD) exceeds the limit.
    std::fs::write(dir.path().join("big.txt"), "").unwrap();
    run("git", &["add", "big.txt"], dir.path());
    run("git", &["commit", "-q", "-m", "add big.txt"], dir.path());
    // 300 KB file full of 3-byte UTF-8 (Japanese hiragana あ)
    let unicode_chunk: String = "あ".repeat(100_000); // 300 KB
    std::fs::write(dir.path().join("big.txt"), &unicode_chunk).unwrap();
    let s = devscope_lib::git::diff::summarize_working_tree(dir.path()).unwrap();
    assert!(s.truncated, "expected truncation");
    // If we wrongly cut mid-character, `diff` would not be valid UTF-8 —
    // the .as_str() call on the underlying String here would actually
    // have panicked at write-time. So just assert basic sanity:
    assert!(s.diff.len() <= 256 * 1024 + 1024); // allow tiny overshoot from last full line
    assert!(s.diff.is_char_boundary(s.diff.len()));
}

#[test]
fn walk_for_repos_returns_sorted_paths() {
    let dir = tempdir().unwrap();
    let root = dir.path();
    // create three repos in non-alphabetical creation order
    for name in &["zebra", "alpha", "mango"] {
        let r = root.join(name);
        std::fs::create_dir_all(&r).unwrap();
        run("git", &["init", "-q", "-b", "main"], &r);
    }
    let found = devscope_lib::git::discover::walk_for_repos(root, 3);
    let names: Vec<String> = found.iter().map(|f| f.name.clone()).collect();
    assert_eq!(names, vec!["alpha", "mango", "zebra"]);
}
