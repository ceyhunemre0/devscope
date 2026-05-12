CREATE TABLE projects (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    name              TEXT    NOT NULL UNIQUE,
    path              TEXT    NOT NULL UNIQUE,
    summary           TEXT,
    tech_stack        TEXT,
    readme_excerpt    TEXT,
    last_scanned_at   TEXT,
    last_activity_at  TEXT,
    state             TEXT    NOT NULL DEFAULT 'active'
                              CHECK (state IN ('active','archived')),
    extra             TEXT,
    created_at        TEXT    NOT NULL,
    updated_at        TEXT    NOT NULL
);

CREATE TABLE events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id    INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    source        TEXT    NOT NULL,
    type          TEXT    NOT NULL,
    external_id   TEXT,
    payload       TEXT    NOT NULL,
    occurred_at   TEXT    NOT NULL,
    collected_at  TEXT    NOT NULL,
    UNIQUE (source, external_id)
);
CREATE INDEX idx_events_project_occurred ON events(project_id, occurred_at DESC);
CREATE INDEX idx_events_occurred         ON events(occurred_at DESC);

CREATE TABLE llm_calls (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    provider        TEXT    NOT NULL,
    model           TEXT    NOT NULL,
    purpose         TEXT    NOT NULL,
    prompt_tokens   INTEGER,
    output_tokens   INTEGER,
    cost_usd        REAL,
    duration_ms     INTEGER,
    succeeded       INTEGER NOT NULL CHECK (succeeded IN (0,1)),
    error           TEXT,
    called_at       TEXT    NOT NULL
);
CREATE INDEX idx_llm_calls_called ON llm_calls(called_at DESC);

CREATE TABLE reports (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id    INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    type          TEXT    NOT NULL,
    period_start  TEXT,
    period_end    TEXT,
    content       TEXT    NOT NULL,
    llm_call_id   INTEGER REFERENCES llm_calls(id) ON DELETE SET NULL,
    generated_at  TEXT    NOT NULL
);
CREATE INDEX idx_reports_generated ON reports(generated_at DESC);

CREATE TABLE settings (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
);
