use git2::Repository;
use std::path::Path;

/// Read first remote (typically "origin") and parse GitHub owner/repo form if possible.
/// Returns None on non-github remote or no remote.
pub fn github_full_name(repo_path: &Path) -> Option<String> {
    let repo = Repository::open(repo_path).ok()?;
    let remote_names = repo.remotes().ok()?;
    let first = remote_names.iter().flatten().next()?;
    let remote = repo.find_remote(first).ok()?;
    let url = remote.url()?.to_string();
    // Matches:
    //   https://github.com/owner/repo.git
    //   git@github.com:owner/repo.git
    //   ssh://git@github.com/owner/repo.git
    let stripped = url.trim_end_matches(".git");
    let after_host = if let Some(rest) = stripped.split_once("github.com/") {
        rest.1
    } else if let Some(rest) = stripped.split_once("github.com:") {
        rest.1
    } else {
        return None;
    };
    let mut parts = after_host.splitn(3, '/');
    let owner = parts.next()?;
    let repo = parts.next()?;
    if owner.is_empty() || repo.is_empty() {
        return None;
    }
    Some(format!("{owner}/{repo}"))
}
