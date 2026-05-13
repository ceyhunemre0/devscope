use std::collections::BTreeMap;
use std::path::Path;

use crate::error::AppResult;
use crate::paths;

#[cfg(unix)]
fn set_mode_600(p: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    let mut perms = std::fs::metadata(p)?.permissions();
    perms.set_mode(0o600);
    std::fs::set_permissions(p, perms)
}
#[cfg(not(unix))]
fn set_mode_600(_p: &Path) -> std::io::Result<()> { Ok(()) }

pub fn load_all() -> AppResult<BTreeMap<String, String>> {
    let p = paths::secrets_path()?;
    if !p.exists() {
        return Ok(BTreeMap::new());
    }
    let raw = std::fs::read_to_string(&p)?;
    Ok(serde_json::from_str(&raw)?)
}

pub fn get(key: &str) -> AppResult<Option<String>> {
    Ok(load_all()?.get(key).cloned())
}

pub fn set(key: &str, value: &str) -> AppResult<()> {
    let mut all = load_all()?;
    all.insert(key.to_string(), value.to_string());
    write_all(&all)
}

pub fn delete(key: &str) -> AppResult<()> {
    let mut all = load_all()?;
    all.remove(key);
    write_all(&all)
}

pub fn mask(value: &str) -> String {
    if value.len() <= 8 { return "•".repeat(value.len()); }
    format!("{}…{}", &value[..4], &value[value.len() - 4..])
}

fn write_all(map: &BTreeMap<String, String>) -> AppResult<()> {
    let p = paths::secrets_path()?;
    let body = serde_json::to_string_pretty(map)?;
    let tmp = p.with_extension("json.tmp");
    std::fs::write(&tmp, body.as_bytes())?;
    set_mode_600(&tmp)?;
    if let Err(e) = std::fs::rename(&tmp, &p) {
        let _ = std::fs::remove_file(&tmp);
        return Err(e.into());
    }
    Ok(())
}
