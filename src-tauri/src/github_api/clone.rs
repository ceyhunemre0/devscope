use git2::{build::RepoBuilder, FetchOptions, RemoteCallbacks};
use std::path::Path;

use crate::error::{AppError, AppResult};

pub fn clone_with_token(url: &str, dest: &Path, token: Option<&str>) -> AppResult<()> {
    let mut callbacks = RemoteCallbacks::new();
    if let Some(t) = token.map(str::to_string) {
        callbacks.credentials(move |_, _, _| git2::Cred::userpass_plaintext("x-access-token", &t));
    }
    let mut fo = FetchOptions::new();
    fo.remote_callbacks(callbacks);
    let mut builder = RepoBuilder::new();
    builder.fetch_options(fo);
    builder.clone(url, dest).map_err(|e| {
        log::warn!("clone failed for {url}: {e}");
        // Extract just the host for a safer frontend-facing message.
        let host = url.split('/').nth(2).unwrap_or("remote");
        AppError::Git(format!("clone failed for {host}"))
    })?;
    Ok(())
}
