import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";

export interface IssueInput {
  title: string;
  symptom: string;
  root_cause: string;
  fix: string;
  failed_approaches: string[];
  attempts: number;
  tags: string[];
  source_project: string;
}

export interface Issue extends IssueInput {
  id: string;
  created_at: string;
}

export interface IssueWithDistance extends Issue {
  distance: number;
}

export interface AissuesDB {
  insertIssue(input: IssueInput, embedding: Float32Array): string;
  getIssue(id: string): Issue | null;
  searchByVector(query: Float32Array, limit: number): IssueWithDistance[];
  listIssues(tag: string | undefined, limit: number): Issue[];
  close(): void;
}

export function createDatabase(path: string): AissuesDB {
  const db = new Database(path);
  sqliteVec.load(db);

  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS issues (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      symptom TEXT NOT NULL,
      root_cause TEXT NOT NULL,
      fix TEXT NOT NULL,
      failed_approaches TEXT NOT NULL DEFAULT '[]',
      attempts INTEGER NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      source_project TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS issues_vec USING vec0(
      id TEXT PRIMARY KEY,
      embedding float[1024]
    )
  `);

  const insertIssueStmt = db.prepare(`
    INSERT INTO issues (id, title, symptom, root_cause, fix, failed_approaches, attempts, tags, source_project)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertVecStmt = db.prepare(`
    INSERT INTO issues_vec (id, embedding) VALUES (?, ?)
  `);

  const getIssueStmt = db.prepare(`
    SELECT * FROM issues WHERE id = ?
  `);

  const searchStmt = db.prepare(`
    SELECT id, distance
    FROM issues_vec
    WHERE embedding MATCH ?
    ORDER BY distance
    LIMIT ?
  `);

  const listAllStmt = db.prepare(`
    SELECT * FROM issues ORDER BY created_at DESC LIMIT ?
  `);

  const listByTagStmt = db.prepare(`
    SELECT * FROM issues WHERE EXISTS (
      SELECT 1 FROM json_each(issues.tags) WHERE json_each.value = ?
    ) ORDER BY created_at DESC LIMIT ?
  `);

  function generateId(): string {
    const now = Date.now().toString(36);
    const rand = Math.random().toString(36).substring(2, 8);
    return `KI-${now}-${rand}`;
  }

  function parseIssueRow(row: any): Issue {
    return {
      ...row,
      failed_approaches: JSON.parse(row.failed_approaches),
      tags: JSON.parse(row.tags),
    };
  }

  const insertBoth = db.transaction((id: string, input: IssueInput, embedding: Float32Array) => {
    insertIssueStmt.run(
      id,
      input.title,
      input.symptom,
      input.root_cause,
      input.fix,
      JSON.stringify(input.failed_approaches),
      input.attempts,
      JSON.stringify(input.tags),
      input.source_project
    );
    insertVecStmt.run(id, embedding);
  });

  return {
    insertIssue(input: IssueInput, embedding: Float32Array): string {
      const id = generateId();
      insertBoth(id, input, embedding);
      return id;
    },

    getIssue(id: string): Issue | null {
      const row = getIssueStmt.get(id) as any;
      return row ? parseIssueRow(row) : null;
    },

    searchByVector(query: Float32Array, limit: number): IssueWithDistance[] {
      const vecRows = searchStmt.all(query, limit) as { id: string; distance: number }[];
      if (vecRows.length === 0) return [];
      const ids = vecRows.map((r) => r.id);
      const placeholders = ids.map(() => "?").join(",");
      const issueRows = db.prepare(`SELECT * FROM issues WHERE id IN (${placeholders})`).all(...ids) as any[];
      const issueMap = new Map(issueRows.map((r) => [r.id, r]));
      return vecRows
        .filter((vr) => issueMap.has(vr.id))
        .map((vr) => ({
          ...parseIssueRow(issueMap.get(vr.id)!),
          distance: vr.distance,
        }));
    },

    listIssues(tag: string | undefined, limit: number): Issue[] {
      const rows = tag
        ? (listByTagStmt.all(tag, limit) as any[])
        : (listAllStmt.all(limit) as any[]);
      return rows.map(parseIssueRow);
    },

    close() {
      db.close();
    },
  };
}
