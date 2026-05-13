use chrono::{DateTime, Utc};
use std::collections::HashMap;
use tera::{Error as TeraError, Value};

pub fn hm(value: &Value, _args: &HashMap<String, Value>) -> Result<Value, TeraError> {
    let dt: DateTime<Utc> = serde_json::from_value(value.clone())
        .map_err(|e| TeraError::msg(format!("hm: not a datetime: {e}")))?;
    Ok(Value::String(dt.format("%H:%M").to_string()))
}
