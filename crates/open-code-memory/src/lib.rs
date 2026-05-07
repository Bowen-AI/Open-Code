//! Two-layer memory: **raw** evidence and **semantic** records on SQLite.
//! Shared schema used by the HTTP service and tests.

use chrono::Utc;
use rusqlite::types::Type;
use rusqlite::{params, Connection};

pub const DB_FILE: &str = "open_code_memory.db";
pub const SCHEMA_VERSION: i64 = 1;

/// Initialize schema. Safe to call on existing DBs; future migrations should bump SCHEMA_VERSION.
pub fn init_db(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        r#"
        PRAGMA foreign_keys = ON;
        PRAGMA journal_mode = WAL;

        CREATE TABLE IF NOT EXISTS schema_meta (
            key         TEXT PRIMARY KEY,
            value       TEXT NOT NULL,
            updated_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS raw_evidence (
            id          TEXT PRIMARY KEY,
            project_id  TEXT NOT NULL,
            session_id  TEXT,
            kind        TEXT NOT NULL,
            content_hash BLOB,
            payload_json TEXT NOT NULL,
            created_at  TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_raw_project ON raw_evidence(project_id);
        CREATE INDEX IF NOT EXISTS idx_raw_session ON raw_evidence(session_id);
        CREATE INDEX IF NOT EXISTS idx_raw_created ON raw_evidence(created_at);

        CREATE TABLE IF NOT EXISTS semantic_records (
            id          TEXT PRIMARY KEY,
            project_id  TEXT NOT NULL,
            kind        TEXT NOT NULL,
            body_json   TEXT NOT NULL,
            source_raw_ids_json TEXT,
            created_at  TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sem_project ON semantic_records(project_id);
        "#,
    )?;
    conn.execute(
        "INSERT OR REPLACE INTO schema_meta (key, value, updated_at) VALUES ('schema_version', ?1, ?2)",
        params![SCHEMA_VERSION.to_string(), Utc::now().to_rfc3339()],
    )?;
    Ok(())
}

pub fn schema_version(conn: &Connection) -> rusqlite::Result<i64> {
    conn.query_row(
        "SELECT value FROM schema_meta WHERE key = 'schema_version'",
        [],
        |r| {
            let value: String = r.get(0)?;
            Ok(value.parse::<i64>().unwrap_or(0))
        },
    )
}

fn hash_payload(bytes: &[u8]) -> Vec<u8> {
    use sha2::{Digest, Sha256};
    Sha256::digest(bytes).to_vec()
}

/// Append a raw row; returns the new id.
pub fn append_raw(
    conn: &Connection,
    project_id: &str,
    session_id: Option<&str>,
    kind: &str,
    payload: &serde_json::Value,
) -> rusqlite::Result<String> {
    let id = uuid::Uuid::new_v4().to_string();
    let json = payload.to_string();
    let hash = hash_payload(json.as_bytes());
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO raw_evidence (id, project_id, session_id, kind, content_hash, payload_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, project_id, session_id, kind, hash, json, now],
    )?;
    Ok(id)
}

pub fn append_semantic(
    conn: &Connection,
    project_id: &str,
    kind: &str,
    body: &serde_json::Value,
    source_raw_ids: Option<&[String]>,
) -> rusqlite::Result<String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let source_json = source_raw_ids
        .map(serde_json::to_string)
        .transpose()
        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(e.into()))?;
    conn.execute(
        "INSERT INTO semantic_records (id, project_id, kind, body_json, source_raw_ids_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, project_id, kind, body.to_string(), source_json, now],
    )?;
    Ok(id)
}

pub fn clear_project(conn: &Connection, project_id: &str) -> rusqlite::Result<usize> {
    let n1 = conn.execute(
        "DELETE FROM raw_evidence WHERE project_id = ?1",
        [project_id],
    )?;
    let n2 = conn.execute(
        "DELETE FROM semantic_records WHERE project_id = ?1",
        [project_id],
    )?;
    Ok(n1 + n2)
}

pub fn recent_raw(
    conn: &Connection,
    project_id: &str,
    limit: i64,
) -> rusqlite::Result<Vec<serde_json::Value>> {
    let limit = limit.clamp(0, 500);
    let mut stmt = conn.prepare(
        "SELECT id, project_id, session_id, kind, payload_json, created_at
         FROM raw_evidence WHERE project_id = ?1 ORDER BY created_at DESC LIMIT ?2",
    )?;
    let rows = stmt
        .query_map(params![project_id, limit], |r| {
            let payload_json: String = r.get(4)?;
            let payload: serde_json::Value = serde_json::from_str(&payload_json)
                .map_err(|e| rusqlite::Error::FromSqlConversionFailure(4, Type::Text, e.into()))?;
            Ok(serde_json::json!({
                "id": r.get::<_, String>(0)?,
                "projectId": r.get::<_, String>(1)?,
                "sessionId": r.get::<_, Option<String>>(2)?,
                "kind": r.get::<_, String>(3)?,
                "payload": payload,
                "createdAt": r.get::<_, String>(5)?,
            }))
        })?
        .collect();
    rows
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn init_and_append() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        assert_eq!(schema_version(&conn).unwrap(), SCHEMA_VERSION);
        let id = append_raw(
            &conn,
            "proj1",
            Some("sess1"),
            "message",
            &serde_json::json!({ "text": "hi" }),
        )
        .unwrap();
        assert!(!id.is_empty());
        let r = recent_raw(&conn, "proj1", 10).unwrap();
        assert_eq!(r.len(), 1);
    }

    #[test]
    fn recent_raw_clamps_limits() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        for n in 0..3 {
            append_raw(
                &conn,
                "proj1",
                Some("sess1"),
                "message",
                &serde_json::json!({ "n": n }),
            )
            .unwrap();
        }

        assert_eq!(recent_raw(&conn, "proj1", -1).unwrap().len(), 0);
        assert_eq!(recent_raw(&conn, "proj1", 2).unwrap().len(), 2);
        assert_eq!(recent_raw(&conn, "proj1", 10_000).unwrap().len(), 3);
    }

    #[test]
    fn recent_raw_surfaces_corrupt_payloads() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        conn.execute(
            "INSERT INTO raw_evidence (id, project_id, session_id, kind, payload_json, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params!["bad", "proj1", "sess1", "message", "{not-json", Utc::now().to_rfc3339()],
        )
        .unwrap();

        assert!(recent_raw(&conn, "proj1", 10).is_err());
    }

    #[test]
    fn clear_project_removes_raw_and_semantic_records() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        let raw_id = append_raw(
            &conn,
            "proj1",
            Some("sess1"),
            "message",
            &serde_json::json!({ "text": "hi" }),
        )
        .unwrap();
        append_semantic(
            &conn,
            "proj1",
            "summary",
            &serde_json::json!({ "text": "hi" }),
            Some(&[raw_id]),
        )
        .unwrap();

        assert_eq!(clear_project(&conn, "proj1").unwrap(), 2);
        assert!(recent_raw(&conn, "proj1", 10).unwrap().is_empty());
    }
}
