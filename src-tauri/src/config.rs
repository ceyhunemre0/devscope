use std::path::Path;
use serde::{Deserialize, Serialize};

use crate::error::AppResult;
use crate::paths;

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct Settings {
    #[serde(default)]
    pub llm: LlmSettings,
    #[serde(default)]
    pub scanner: ScannerSettings,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LlmSettings {
    #[serde(default = "default_provider_chain")]
    pub provider_chain: Vec<String>,
    #[serde(default)]
    pub default_model: LlmModelDefaults,
    #[serde(default)]
    pub budget: BudgetSettings,
}
impl Default for LlmSettings {
    fn default() -> Self {
        Self {
            provider_chain: default_provider_chain(),
            default_model: LlmModelDefaults::default(),
            budget: BudgetSettings::default(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LlmModelDefaults {
    #[serde(default = "default_ollama_model")]
    pub ollama: String,
    #[serde(default = "default_openai_model")]
    pub openai: String,
}
impl Default for LlmModelDefaults {
    fn default() -> Self {
        Self { ollama: default_ollama_model(), openai: default_openai_model() }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BudgetSettings {
    #[serde(default = "default_monthly_usd")]
    pub monthly_usd: f64,
    #[serde(default = "default_true")]
    pub hard_stop: bool,
}
impl Default for BudgetSettings {
    fn default() -> Self {
        Self { monthly_usd: default_monthly_usd(), hard_stop: true }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ScannerSettings {
    #[serde(default = "default_auto_rescan_days")]
    pub auto_rescan_days: u32,
    #[serde(default = "default_max_discover_depth")]
    pub max_discover_depth: u32,
}
impl Default for ScannerSettings {
    fn default() -> Self {
        Self {
            auto_rescan_days: default_auto_rescan_days(),
            max_discover_depth: default_max_discover_depth(),
        }
    }
}

fn default_provider_chain() -> Vec<String> { vec!["ollama".into()] }
fn default_ollama_model() -> String { "llama3.1:8b".into() }
fn default_openai_model() -> String { "gpt-4o-mini".into() }
fn default_monthly_usd() -> f64 { 20.0 }
fn default_true() -> bool { true }
fn default_auto_rescan_days() -> u32 { 30 }
fn default_max_discover_depth() -> u32 { 4 }

pub fn load() -> AppResult<Settings> {
    let p = paths::config_path()?;
    if !p.exists() {
        let defaults = Settings::default();
        save(&defaults)?;
        return Ok(defaults);
    }
    let raw = std::fs::read_to_string(&p)?;
    Ok(toml::from_str(&raw)?)
}

pub fn save(s: &Settings) -> AppResult<()> {
    let p = paths::config_path()?;
    let body = toml::to_string_pretty(s)?;
    atomic_write(&p, body.as_bytes())
}

fn atomic_write(target: &Path, data: &[u8]) -> AppResult<()> {
    let tmp = target.with_extension("toml.tmp");
    std::fs::write(&tmp, data)?;
    std::fs::rename(&tmp, target)?;
    Ok(())
}
