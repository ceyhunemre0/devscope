use serde::Serialize;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(Debug, Serialize, specta::Type)]
pub struct DiscoveredRepo {
    pub path: String,
    pub name: String,
}

pub fn walk_for_repos(root: &Path, max_depth: usize) -> Vec<DiscoveredRepo> {
    let mut out: Vec<DiscoveredRepo> = WalkDir::new(root)
        .max_depth(max_depth)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_dir() && e.file_name() == ".git")
        .filter_map(|e| {
            let repo_dir: PathBuf = e.path().parent()?.to_path_buf();
            let name = repo_dir.file_name()?.to_string_lossy().to_string();
            Some(DiscoveredRepo {
                path: repo_dir.display().to_string(),
                name,
            })
        })
        .collect();
    out.sort_by(|a, b| a.path.cmp(&b.path));
    out
}
