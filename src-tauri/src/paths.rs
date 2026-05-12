use std::path::PathBuf;

/// Resolve ~/.devscope or $DEVSCOPE_HOME, creating the directory if missing.
pub fn home() -> std::io::Result<PathBuf> {
    let p = std::env::var_os("DEVSCOPE_HOME")
        .map(PathBuf::from)
        .or_else(|| dirs::home_dir().map(|h| h.join(".devscope")))
        .expect("home directory must be resolvable");
    std::fs::create_dir_all(&p)?;
    Ok(p)
}

pub fn db_path() -> std::io::Result<PathBuf> {
    Ok(home()?.join("devscope-v2.db"))
}

pub fn config_path() -> std::io::Result<PathBuf> {
    Ok(home()?.join("config.toml"))
}

pub fn secrets_path() -> std::io::Result<PathBuf> {
    Ok(home()?.join("secrets.json"))
}
