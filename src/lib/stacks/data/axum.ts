import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "axum",
  project: "flagship-flags",
  branch: "feat/percentage-rollouts",
  indent: "Spaces: 4",
  files: [
    "Cargo.toml",
    "src/main.rs",
    "src/auth.rs",
    "src/error.rs",
    "src/routes/mod.rs",
    "src/routes/flags.rs",
    "src/store.rs",
    "migrations/0003_flags.sql",
    "tests/flags_api.rs",
  ],
  snippets: [
    {
      filename: "src/routes/flags.rs",
      syntax: "clike",
      languageLabel: "Rust",
      code: `use std::collections::HashMap;

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use validator::Validate;

use crate::auth::{AuthUser, Role};
use crate::error::AppError;
use crate::store::{is_enabled_for, Flag, FlagUpdate};
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/environments/{env}/flags", get(list_flags))
        .route("/environments/{env}/flags/{key}", put(upsert_flag))
        .route("/environments/{env}/evaluate", post(evaluate))
}

#[derive(Debug, Deserialize, Validate)]
pub struct UpsertFlag {
    #[validate(length(max = 280))]
    description: Option<String>,
    enabled: bool,
    #[validate(range(min = 0, max = 100))]
    rollout_percent: i16,
}

#[derive(Debug, Deserialize)]
pub struct ListParams {
    prefix: Option<String>,
    limit: Option<i64>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct EvaluateRequest {
    #[validate(length(min = 1, max = 128))]
    subject_id: String,
    #[validate(length(min = 1, max = 100))]
    keys: Vec<String>,
}

fn valid_key(key: &str) -> bool {
    !key.is_empty()
        && key.len() <= 64
        && key.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

async fn list_flags(
    State(state): State<AppState>,
    user: AuthUser,
    Path(env): Path<String>,
    Query(params): Query<ListParams>,
) -> Result<Json<Vec<Flag>>, AppError> {
    user.require_env(&env)?;
    let limit = params.limit.unwrap_or(50).clamp(1, 200);
    let flags = state.flags.list(&env, params.prefix.as_deref(), limit).await?;
    Ok(Json(flags))
}

async fn upsert_flag(
    State(state): State<AppState>,
    user: AuthUser,
    Path((env, key)): Path<(String, String)>,
    Json(body): Json<UpsertFlag>,
) -> Result<(StatusCode, Json<Flag>), AppError> {
    user.require_env(&env)?;
    user.require_role(Role::Editor)?;
    if !valid_key(&key) {
        return Err(AppError::BadRequest("invalid flag key".into()));
    }
    body.validate()?;
    let update = FlagUpdate {
        description: body.description,
        enabled: body.enabled,
        rollout_percent: body.rollout_percent,
    };
    let (flag, created) = state.flags.upsert(&env, &key, update, user.id).await?;
    Ok((if created { StatusCode::CREATED } else { StatusCode::OK }, Json(flag)))
}

async fn evaluate(
    State(state): State<AppState>,
    user: AuthUser,
    Path(env): Path<String>,
    Json(req): Json<EvaluateRequest>,
) -> Result<Json<HashMap<String, bool>>, AppError> {
    user.require_env(&env)?;
    req.validate()?;
    let found = state.flags.get_many(&env, &req.keys).await?;
    let mut flags: HashMap<String, bool> = req.keys.iter().map(|k| (k.clone(), false)).collect();
    for flag in &found {
        flags.insert(flag.key.clone(), is_enabled_for(flag, &req.subject_id));
    }
    Ok(Json(flags))
}`,
    },
    {
      filename: "src/store.rs",
      syntax: "clike",
      languageLabel: "Rust",
      code: `use chrono::{DateTime, Utc};
use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

const FLAG_COLUMNS: &str =
    "key, environment, description, enabled, rollout_percent, updated_by, updated_at";

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct Flag {
    pub key: String,
    pub environment: String,
    pub description: Option<String>,
    pub enabled: bool,
    pub rollout_percent: i16,
    pub updated_by: Uuid,
    pub updated_at: DateTime<Utc>,
}

#[derive(FromRow)]
struct UpsertRow {
    #[sqlx(flatten)]
    flag: Flag,
    inserted: bool,
}

pub struct FlagUpdate {
    pub description: Option<String>,
    pub enabled: bool,
    pub rollout_percent: i16,
}

#[derive(Clone)]
pub struct FlagStore(pub PgPool);

impl FlagStore {
    pub async fn list(&self, env: &str, prefix: Option<&str>, n: i64) -> sqlx::Result<Vec<Flag>> {
        // starts_with() avoids LIKE, so '%' and '_' in the prefix are not wildcards.
        let sql = format!(
            "SELECT {FLAG_COLUMNS} FROM flags WHERE environment = $1 {}",
            "AND ($2::text IS NULL OR starts_with(key, $2)) ORDER BY key LIMIT $3"
        );
        sqlx::query_as::<_, Flag>(&sql)
            .bind(env)
            .bind(prefix)
            .bind(n)
            .fetch_all(&self.0)
            .await
    }

    pub async fn get_many(&self, env: &str, keys: &[String]) -> sqlx::Result<Vec<Flag>> {
        let sql = format!("SELECT {FLAG_COLUMNS} FROM flags WHERE environment = $1 {}",
            "AND key = ANY($2)");
        sqlx::query_as::<_, Flag>(&sql).bind(env).bind(keys).fetch_all(&self.0).await
    }

    pub async fn upsert(
        &self,
        env: &str,
        key: &str,
        update: FlagUpdate,
        user_id: Uuid,
    ) -> sqlx::Result<(Flag, bool)> {
        // xmax = 0 is only true for a freshly inserted row version.
        let sql = format!(
            "{}{}{}{}updated_at = now() RETURNING {FLAG_COLUMNS}, (xmax = 0) AS inserted",
            "INSERT INTO flags (environment, key, description, enabled, rollout_percent, ",
            "updated_by) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (environment, key) ",
            "DO UPDATE SET description = EXCLUDED.description, enabled = EXCLUDED.enabled, ",
            "rollout_percent = EXCLUDED.rollout_percent, updated_by = EXCLUDED.updated_by, ",
        );
        let row = sqlx::query_as::<_, UpsertRow>(&sql)
            .bind(env)
            .bind(key)
            .bind(update.description)
            .bind(update.enabled)
            .bind(update.rollout_percent)
            .bind(user_id)
            .fetch_one(&self.0)
            .await?;
        Ok((row.flag, row.inserted))
    }
}

// Stable across builds and platforms, unlike std's DefaultHasher.
pub fn is_enabled_for(flag: &Flag, subject_id: &str) -> bool {
    if !flag.enabled {
        return false;
    }
    let digest = Sha256::digest(format!("{}:{}", flag.key, subject_id).as_bytes());
    let bucket = u32::from_be_bytes([digest[0], digest[1], digest[2], digest[3]]) % 100;
    (bucket as i16) < flag.rollout_percent
}`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "Why hash with SHA-256 for bucketing? `DefaultHasher` would be faster.",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "Speed isn't the issue. **Stability** is. The docs for `std::collections::hash_map::DefaultHasher` say its algorithm is unspecified and may change between Rust releases. If it changed after a toolchain upgrade, every subject would land in a different bucket and a 10% rollout would suddenly reach a different 10% of users.\n\nSHA-256 gives the same output on every platform and in every language, so the mobile SDK can compute the same bucket locally. Hashing `key:subject_id`, not just the subject, also means each flag gets an independent split rather than always enabling the same users first.\n\nIt costs a few hundred nanoseconds per evaluation, which is negligible next to the database query.",
      delay: 12000,
    },
    {
      role: "user",
      content: "Is the `(xmax = 0) AS inserted` trick reliable?",
      delay: 24000,
    },
    {
      role: "assistant",
      content:
        "It's a widely used Postgres idiom, but it relies on internals rather than a documented API. `xmax` is the system column holding the ID of the transaction that deleted or locked a row version. A freshly inserted tuple has `xmax = 0`. The `ON CONFLICT DO UPDATE` path creates a new version whose `xmax` is set, so the expression is false.\n\nIt has held from Postgres 9.5 through current releases, and it's only used to pick 201 or 200. If you'd rather not depend on it, Postgres 18 lets you write `RETURNING old.key IS NULL AS inserted`, which states the intent directly. I'd switch once all environments are on 18.",
      delay: 36000,
    },
    {
      role: "user",
      content: "Why does `evaluate` default missing keys to `false` instead of returning 404?",
      delay: 48000,
    },
    {
      role: "assistant",
      content:
        "Evaluation is called on hot paths by SDKs, and flags are often referenced in code before they exist in an environment, or after they're cleaned up. Failing the whole batch because one key is unknown would turn a config gap into an outage.\n\nSo the handler:\n\n1. Fills the map with `false` for every requested key.\n2. Overwrites entries for flags that exist with the bucketed result.\n\nThat makes \"off\" the safe default, which is the usual contract for feature flags. The `#[validate(length(max = 100))]` on `keys` limits the `ANY($2)` array so one request can't ask for thousands of keys. If you want visibility, log unknown keys at `debug` level.",
      delay: 60000,
    },
  ],
};

export default config;
