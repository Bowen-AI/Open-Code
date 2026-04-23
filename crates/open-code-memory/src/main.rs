//! `open-code-memoryd` — localhost HTTP service for the Open Code memory layers.

use axum::extract::Query;
use axum::extract::State;
use axum::routing::{get, post};
use axum::{Json, Router};
use open_code_memory::{self as mem, init_db, DB_FILE};
use rusqlite::Connection;
use serde::Deserialize;
use std::fs;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::net::TcpListener;
use tower_http::cors::CorsLayer;

#[derive(Clone)]
struct AppState {
    db_path: PathBuf,
}

fn open_conn(data_dir: &PathBuf) -> Result<Connection, String> {
    fs::create_dir_all(data_dir).map_err(|e| e.to_string())?;
    let p = data_dir.join(DB_FILE);
    let conn = Connection::open(p).map_err(|e| e.to_string())?;
    init_db(&conn).map_err(|e| e.to_string())?;
    Ok(conn)
}

#[tokio::main]
async fn main() -> Result<(), String> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("info".parse().unwrap()),
        )
        .init();

    let mut args = std::env::args().skip(1);
    let mut data_dir: PathBuf = std::env::current_dir()
        .map_err(|e| e.to_string())?
        .join(".open-code/memory");
    let mut port_file: Option<PathBuf> = None;

    while let Some(a) = args.next() {
        match a.as_str() {
            "--data-dir" => {
                data_dir = PathBuf::from(args.next().ok_or("missing value for --data-dir")?);
            }
            "--port-file" => {
                port_file = Some(PathBuf::from(
                    args.next().ok_or("missing value for --port-file")?,
                ));
            }
            _ => eprintln!("Unknown arg: {a} (use --data-dir, --port-file)"),
        }
    }

    let _ = open_conn(&data_dir)?;

    let state = Arc::new(AppState { db_path: data_dir });
    let app = Router::new()
        .route("/v1/health", get(health))
        .route("/v1/raw/append", post(raw_append))
        .route("/v1/semantic/append", post(sem_append))
        .route("/v1/raw/clear", post(raw_clear))
        .route("/v1/raw/recent", get(raw_recent))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], 0));
    let listener = TcpListener::bind(&addr).await.map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();

    if let Some(pf) = &port_file {
        if let Some(parent) = pf.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(pf, port.to_string()).map_err(|e| e.to_string())?;
        tracing::info!(path = %pf.display(), port, "Wrote port file");
    }

    tracing::info!(port, "open-code-memoryd listening on 127.0.0.1");
    axum::serve(listener, app)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "ok": true, "service": "open-code-memoryd" }))
}

#[derive(Deserialize)]
struct RawAppend {
    project_id: String,
    session_id: Option<String>,
    kind: String,
    payload: serde_json::Value,
}

async fn raw_append(
    State(s): State<Arc<AppState>>,
    Json(body): Json<RawAppend>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    let conn =
        open_conn(&s.db_path).map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let id = mem::append_raw(
        &conn,
        &body.project_id,
        body.session_id.as_deref(),
        &body.kind,
        &body.payload,
    )
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(serde_json::json!({ "id": id })))
}

#[derive(Deserialize)]
struct SemAppend {
    project_id: String,
    kind: String,
    body: serde_json::Value,
    source_raw_ids: Option<Vec<String>>,
}

async fn sem_append(
    State(s): State<Arc<AppState>>,
    Json(body): Json<SemAppend>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    let conn =
        open_conn(&s.db_path).map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let id = mem::append_semantic(
        &conn,
        &body.project_id,
        &body.kind,
        &body.body,
        body.source_raw_ids.as_deref(),
    )
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(serde_json::json!({ "id": id })))
}

#[derive(Deserialize)]
struct ClearProject {
    project_id: String,
}

async fn raw_clear(
    State(s): State<Arc<AppState>>,
    Json(body): Json<ClearProject>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    let conn =
        open_conn(&s.db_path).map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let n = mem::clear_project(&conn, &body.project_id)
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(serde_json::json!({ "deleted": n })))
}

#[derive(Deserialize)]
struct RecentQ {
    project_id: String,
    limit: Option<i64>,
}

async fn raw_recent(
    State(s): State<Arc<AppState>>,
    Query(q): Query<RecentQ>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    let conn =
        open_conn(&s.db_path).map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let limit = q.limit.unwrap_or(50);
    let rows = mem::recent_raw(&conn, &q.project_id, limit)
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(serde_json::json!({ "items": rows })))
}
