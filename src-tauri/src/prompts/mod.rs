use std::sync::OnceLock;
use tera::{Context, Tera};

use crate::error::AppResult;

pub mod contexts;
pub mod filters;

static TERA: OnceLock<Tera> = OnceLock::new();

fn engine() -> &'static Tera {
    TERA.get_or_init(|| {
        let mut tera = Tera::default();
        tera.add_raw_templates(vec![
            ("standup",         include_str!("../../templates/standup.tera")),
            ("commit_message",  include_str!("../../templates/commit_message.tera")),
            ("extract_changes", include_str!("../../templates/extract_changes.tera")),
        ]).expect("templates compile at startup");
        tera.register_filter("hm", filters::hm);
        tera
    })
}

pub fn render_standup(ctx: &contexts::StandupContext) -> AppResult<String> {
    let c = Context::from_serialize(ctx)?;
    Ok(engine().render("standup", &c)?)
}

pub fn render_commit_message(ctx: &contexts::CommitMessageContext) -> AppResult<String> {
    let c = Context::from_serialize(ctx)?;
    Ok(engine().render("commit_message", &c)?)
}

pub fn render_extract_changes(ctx: &contexts::ExtractChangesContext) -> AppResult<String> {
    let c = Context::from_serialize(ctx)?;
    Ok(engine().render("extract_changes", &c)?)
}
