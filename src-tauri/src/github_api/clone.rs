use std::path::Path;
use git2::{build::RepoBuilder, FetchOptions, RemoteCallbacks};

use crate::error::AppResult;

pub fn clone_with_token(url: &str, dest: &Path, token: Option<&str>) -> AppResult<()> {
    let mut callbacks = RemoteCallbacks::new();
    if let Some(t) = token.map(str::to_string) {
        callbacks.credentials(move |_, _, _| {
            git2::Cred::userpass_plaintext("x-access-token", &t)
        });
    }
    let mut fo = FetchOptions::new();
    fo.remote_callbacks(callbacks);
    let mut builder = RepoBuilder::new();
    builder.fetch_options(fo);
    builder.clone(url, dest)?;
    Ok(())
}
