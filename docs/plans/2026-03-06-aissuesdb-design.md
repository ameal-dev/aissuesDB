# aissuesDB — Design Document

A local MCP server that provides semantic search over a personal registry of hard-won debugging solutions. Replaces flat-file `known-issues.md` with vector-indexed SQLite for efficient retrieval as the registry grows.

## Architecture

Single-process TypeScript MCP server (stdio transport). SQLite + sqlite-vec for storage and vector search. Anthropic Voyager API for embedding generation.

```
Claude Code ──MCP (stdio)──> aissuesDB server
                                ├── MCP tool handlers (tools.ts)
                                ├── SQLite + sqlite-vec (db.ts)
                                └── Anthropic Voyager API (embeddings.ts)
```

## Data Model

SQLite table `issues`:

| Column | Type | Purpose |
|--------|------|---------|
| `id` | TEXT (ULID) | Unique sortable ID (e.g. `KI-006`) |
| `title` | TEXT | Short descriptive title |
| `symptom` | TEXT | What the user sees |
| `root_cause` | TEXT | Why it actually happens |
| `fix` | TEXT | Working solution (markdown with code blocks) |
| `failed_approaches` | TEXT (JSON array) | What was tried and didn't work |
| `attempts` | INTEGER | Number of attempts before solving |
| `tags` | TEXT (JSON array) | e.g. `["swiftui", "nswindow", "macos"]` |
| `source_project` | TEXT | Project where discovered |
| `created_at` | TEXT (ISO 8601) | When added |
| `embedding` | BLOB | 1024-dim float vector from Voyager |

Virtual table for vector search:

```sql
CREATE VIRTUAL TABLE issues_vec USING vec0(
  id TEXT PRIMARY KEY,
  embedding float[1024]
);
```

Embedding is generated from: `title + " " + symptom + " " + root_cause + " " + tags.join(" ")`

## MCP Tools

### `search_issues`
- **Input:** `{ query: string, limit?: number (default 5) }`
- **Flow:** query → Voyager API → embedding → sqlite-vec nearest neighbor → return full issue rows
- **Output:** Top N issues ranked by cosine similarity

### `add_issue`
- **Input:** `{ title, symptom, root_cause, fix, failed_approaches?, attempts, tags, source_project }`
- **Flow:** validate → generate embedding → insert into `issues` + `issues_vec`
- **Output:** `{ id, message }`

### `list_issues`
- **Input:** `{ tag?: string, limit?: number (default 20) }`
- **Flow:** SQL query with optional tag filter
- **Output:** Issues matching filter

## Project Structure

```
aissuesDB/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # MCP server entry (stdio transport)
│   ├── db.ts             # SQLite + sqlite-vec setup and queries
│   ├── embeddings.ts     # Anthropic Voyager API client
│   └── tools.ts          # Tool handlers
├── data/
│   └── aissues.db        # SQLite database (gitignored)
└── seed.ts               # Import existing known-issues.md entries
```

## Integration

Claude Code MCP config in `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "aissuesDB": {
      "command": "node",
      "args": ["/Users/emil.ryden/code/aissuesDB/dist/index.js"],
      "env": { "ANTHROPIC_API_KEY": "..." }
    }
  }
}
```

CLAUDE.md instructions updated to use `search_issues` before debugging and `add_issue` after solving hard bugs (4+ attempts, not one-off setup mistakes).

## Tech Stack

- TypeScript
- `@modelcontextprotocol/sdk` — MCP server framework
- `better-sqlite3` — SQLite driver
- `sqlite-vec` — Vector search extension for SQLite
- `@anthropic-ai/sdk` — Voyager embedding API
- `ulid` — Sortable unique IDs

## Seed Migration

`seed.ts` parses the 6 existing entries from `~/.claude/knowledge/known-issues.md`, generates embeddings via Voyager, and inserts them into the DB. Run once after initial setup.
