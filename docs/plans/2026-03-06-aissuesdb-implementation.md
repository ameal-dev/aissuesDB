# aissuesDB Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a local MCP server that provides semantic vector search over a personal known-issues debugging registry.

**Architecture:** Single-process TypeScript MCP server using stdio transport. SQLite + sqlite-vec for storage and vector similarity search. Voyage AI API for embedding generation. Three tools: search_issues, add_issue, list_issues.

**Tech Stack:** TypeScript, @modelcontextprotocol/sdk, better-sqlite3, sqlite-vec, voyageai, zod

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`

**Step 1: Initialize package.json**

```bash
cd /Users/emil.ryden/code/aissuesDB
npm init -y
```

Then replace contents of `package.json`:

```json
{
  "name": "aissuesdb",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "start": "node dist/index.js",
    "seed": "node dist/seed.js",
    "test": "vitest run"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Create .gitignore**

```
node_modules/
dist/
data/*.db
.env
```

**Step 4: Install dependencies**

```bash
npm install @modelcontextprotocol/sdk better-sqlite3 sqlite-vec voyageai zod
npm install -D typescript @types/better-sqlite3 @types/node vitest
```

**Step 5: Create directory structure**

```bash
mkdir -p src data
```

**Step 6: Commit**

```bash
git add package.json tsconfig.json .gitignore package-lock.json
git commit -m "chore: scaffold project with dependencies"
```

---

### Task 2: Database Layer

**Files:**
- Create: `src/db.ts`
- Create: `src/db.test.ts`

**Step 1: Write the failing test**

Create `src/db.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDatabase, type AissuesDB } from "./db.js";

describe("AissuesDB", () => {
  let db: AissuesDB;

  beforeEach(() => {
    db = createDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  it("should insert and retrieve an issue by id", () => {
    const embedding = new Float32Array(1024).fill(0.1);
    const id = db.insertIssue({
      title: "Test issue",
      symptom: "Something broke",
      root_cause: "Bad code",
      fix: "Good code",
      failed_approaches: ["tried X"],
      attempts: 4,
      tags: ["test", "vitest"],
      source_project: "aissuesDB",
    }, embedding);

    const issue = db.getIssue(id);
    expect(issue).not.toBeNull();
    expect(issue!.title).toBe("Test issue");
    expect(issue!.tags).toEqual(["test", "vitest"]);
    expect(issue!.attempts).toBe(4);
  });

  it("should find nearest neighbors by vector similarity", () => {
    const emb1 = new Float32Array(1024).fill(0.1);
    const emb2 = new Float32Array(1024).fill(0.9);
    const emb3 = new Float32Array(1024).fill(0.2);

    db.insertIssue({
      title: "Issue A",
      symptom: "A",
      root_cause: "A",
      fix: "A",
      failed_approaches: [],
      attempts: 4,
      tags: ["a"],
      source_project: "test",
    }, emb1);

    db.insertIssue({
      title: "Issue B",
      symptom: "B",
      root_cause: "B",
      fix: "B",
      failed_approaches: [],
      attempts: 5,
      tags: ["b"],
      source_project: "test",
    }, emb2);

    db.insertIssue({
      title: "Issue C",
      symptom: "C",
      root_cause: "C",
      fix: "C",
      failed_approaches: [],
      attempts: 4,
      tags: ["c"],
      source_project: "test",
    }, emb3);

    // Query close to emb1/emb3 (low values), far from emb2
    const query = new Float32Array(1024).fill(0.15);
    const results = db.searchByVector(query, 2);

    expect(results).toHaveLength(2);
    expect(results[0].title).toBe("Issue A");
    expect(results[1].title).toBe("Issue C");
    expect(results[0].distance).toBeDefined();
  });

  it("should list issues filtered by tag", () => {
    const emb = new Float32Array(1024).fill(0.1);

    db.insertIssue({
      title: "SwiftUI bug",
      symptom: "S",
      root_cause: "S",
      fix: "S",
      failed_approaches: [],
      attempts: 4,
      tags: ["swiftui", "macos"],
      source_project: "test",
    }, emb);

    db.insertIssue({
      title: "React bug",
      symptom: "R",
      root_cause: "R",
      fix: "R",
      failed_approaches: [],
      attempts: 5,
      tags: ["react", "web"],
      source_project: "test",
    }, emb);

    const swiftResults = db.listIssues("swiftui", 20);
    expect(swiftResults).toHaveLength(1);
    expect(swiftResults[0].title).toBe("SwiftUI bug");

    const allResults = db.listIssues(undefined, 20);
    expect(allResults).toHaveLength(2);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/db.test.ts
```

Expected: FAIL — cannot find module `./db.js`

**Step 3: Write the implementation**

Create `src/db.ts`:

```typescript
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

  const getIssuesByIdsStmt = (ids: string[]) =>
    db.prepare(`SELECT * FROM issues WHERE id IN (${ids.map(() => "?").join(",")})`);

  const listAllStmt = db.prepare(`
    SELECT * FROM issues ORDER BY created_at DESC LIMIT ?
  `);

  const listByTagStmt = db.prepare(`
    SELECT * FROM issues WHERE tags LIKE ? ORDER BY created_at DESC LIMIT ?
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

  return {
    insertIssue(input: IssueInput, embedding: Float32Array): string {
      const id = generateId();
      const insertBoth = db.transaction(() => {
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
      insertBoth();
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
      const issueRows = getIssuesByIdsStmt(ids).all(...ids) as any[];
      const issueMap = new Map(issueRows.map((r) => [r.id, r]));
      return vecRows.map((vr) => ({
        ...parseIssueRow(issueMap.get(vr.id)),
        distance: vr.distance,
      }));
    },

    listIssues(tag: string | undefined, limit: number): Issue[] {
      const rows = tag
        ? (listByTagStmt.all(`%"${tag}"%`, limit) as any[])
        : (listAllStmt.all(limit) as any[]);
      return rows.map(parseIssueRow);
    },

    close() {
      db.close();
    },
  };
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/db.test.ts
```

Expected: 3 tests PASS

**Step 5: Commit**

```bash
git add src/db.ts src/db.test.ts
git commit -m "feat: add database layer with SQLite + sqlite-vec"
```

---

### Task 3: Embeddings Layer

**Files:**
- Create: `src/embeddings.ts`
- Create: `src/embeddings.test.ts`

**Step 1: Write the failing test**

Create `src/embeddings.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { createEmbeddingClient, type EmbeddingClient } from "./embeddings.js";

describe("EmbeddingClient", () => {
  it("should generate a 1024-dim Float32Array from text", async () => {
    const mockVoyage = {
      embed: vi.fn().mockResolvedValue({
        data: [{ embedding: Array.from({ length: 1024 }, (_, i) => i * 0.001) }],
      }),
    };

    const client = createEmbeddingClient(mockVoyage as any);
    const result = await client.embed("test query");

    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(1024);
    expect(mockVoyage.embed).toHaveBeenCalledWith({
      input: "test query",
      model: "voyage-3-large",
      outputDimension: 1024,
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/embeddings.test.ts
```

Expected: FAIL — cannot find module `./embeddings.js`

**Step 3: Write the implementation**

Create `src/embeddings.ts`:

```typescript
import { VoyageAIClient } from "voyageai";

export interface EmbeddingClient {
  embed(text: string): Promise<Float32Array>;
}

export function createEmbeddingClient(
  voyage?: VoyageAIClient
): EmbeddingClient {
  const client = voyage ?? new VoyageAIClient({
    apiKey: process.env.VOYAGE_API_KEY,
  });

  return {
    async embed(text: string): Promise<Float32Array> {
      const response = await client.embed({
        input: text,
        model: "voyage-3-large",
        outputDimension: 1024,
      });
      return new Float32Array(response.data![0].embedding!);
    },
  };
}

export function buildEmbeddingText(issue: {
  title: string;
  symptom: string;
  root_cause: string;
  tags: string[];
}): string {
  return `${issue.title} ${issue.symptom} ${issue.root_cause} ${issue.tags.join(" ")}`;
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/embeddings.test.ts
```

Expected: 1 test PASS

**Step 5: Commit**

```bash
git add src/embeddings.ts src/embeddings.test.ts
git commit -m "feat: add Voyage AI embedding client"
```

---

### Task 4: MCP Tool Handlers

**Files:**
- Create: `src/tools.ts`
- Create: `src/tools.test.ts`

**Step 1: Write the failing test**

Create `src/tools.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createToolHandlers, type ToolHandlers } from "./tools.js";
import { createDatabase, type AissuesDB } from "./db.js";
import type { EmbeddingClient } from "./embeddings.js";

function mockEmbeddingClient(): EmbeddingClient {
  let callCount = 0;
  return {
    async embed(_text: string): Promise<Float32Array> {
      callCount++;
      // Return slightly different embeddings each call for realistic testing
      return new Float32Array(1024).fill(0.1 * callCount);
    },
  };
}

describe("ToolHandlers", () => {
  let db: AissuesDB;
  let embedder: EmbeddingClient;
  let tools: ToolHandlers;

  beforeEach(() => {
    db = createDatabase(":memory:");
    embedder = mockEmbeddingClient();
    tools = createToolHandlers(db, embedder);
  });

  afterEach(() => {
    db.close();
  });

  it("add_issue should insert and return an id", async () => {
    const result = await tools.addIssue({
      title: "Test crash",
      symptom: "App crashes on launch",
      root_cause: "Missing null check",
      fix: "Add null check",
      failed_approaches: ["tried restart"],
      attempts: 4,
      tags: ["ios", "crash"],
      source_project: "TestApp",
    });

    expect(result.id).toBeDefined();
    expect(result.id).toContain("KI-");

    const issue = db.getIssue(result.id);
    expect(issue).not.toBeNull();
    expect(issue!.title).toBe("Test crash");
  });

  it("search_issues should return relevant results", async () => {
    await tools.addIssue({
      title: "SwiftUI crash",
      symptom: "EXC_BAD_ACCESS in button action",
      root_cause: "NSWindow close during SwiftUI lifecycle",
      fix: "Defer close with async",
      failed_approaches: [],
      attempts: 5,
      tags: ["swiftui", "macos"],
      source_project: "TestApp",
    });

    const results = await tools.searchIssues({
      query: "SwiftUI button crash",
      limit: 5,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toBe("SwiftUI crash");
    expect(results[0].distance).toBeDefined();
  });

  it("list_issues should filter by tag", async () => {
    await tools.addIssue({
      title: "Issue A",
      symptom: "A",
      root_cause: "A",
      fix: "A",
      failed_approaches: [],
      attempts: 4,
      tags: ["swiftui"],
      source_project: "test",
    });

    await tools.addIssue({
      title: "Issue B",
      symptom: "B",
      root_cause: "B",
      fix: "B",
      failed_approaches: [],
      attempts: 4,
      tags: ["react"],
      source_project: "test",
    });

    const swiftResults = await tools.listIssues({ tag: "swiftui" });
    expect(swiftResults).toHaveLength(1);
    expect(swiftResults[0].title).toBe("Issue A");

    const allResults = await tools.listIssues({});
    expect(allResults).toHaveLength(2);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/tools.test.ts
```

Expected: FAIL — cannot find module `./tools.js`

**Step 3: Write the implementation**

Create `src/tools.ts`:

```typescript
import type { AissuesDB, IssueInput, Issue, IssueWithDistance } from "./db.js";
import type { EmbeddingClient } from "./embeddings.js";
import { buildEmbeddingText } from "./embeddings.js";

export interface ToolHandlers {
  addIssue(input: IssueInput): Promise<{ id: string; message: string }>;
  searchIssues(input: { query: string; limit?: number }): Promise<IssueWithDistance[]>;
  listIssues(input: { tag?: string; limit?: number }): Promise<Issue[]>;
}

export function createToolHandlers(
  db: AissuesDB,
  embedder: EmbeddingClient
): ToolHandlers {
  return {
    async addIssue(input: IssueInput) {
      const text = buildEmbeddingText(input);
      const embedding = await embedder.embed(text);
      const id = db.insertIssue(input, embedding);
      return { id, message: `Issue ${id} added successfully` };
    },

    async searchIssues({ query, limit = 5 }) {
      const embedding = await embedder.embed(query);
      return db.searchByVector(embedding, limit);
    },

    async listIssues({ tag, limit = 20 }) {
      return db.listIssues(tag, limit);
    },
  };
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/tools.test.ts
```

Expected: 3 tests PASS

**Step 5: Commit**

```bash
git add src/tools.ts src/tools.test.ts
git commit -m "feat: add MCP tool handlers for search, add, list"
```

---

### Task 5: MCP Server Entry Point

**Files:**
- Create: `src/index.ts`

**Step 1: Write the MCP server**

Create `src/index.ts`:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createDatabase } from "./db.js";
import { createEmbeddingClient } from "./embeddings.js";
import { createToolHandlers } from "./tools.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "..", "data", "aissues.db");

const db = createDatabase(dbPath);
const embedder = createEmbeddingClient();
const tools = createToolHandlers(db, embedder);

const server = new McpServer({
  name: "aissuesDB",
  version: "0.1.0",
});

server.tool(
  "search_issues",
  "Search the known-issues registry by describing a symptom, error message, or problem. Returns semantically similar past issues with their root causes and fixes.",
  {
    query: z.string().describe("Describe the symptom or error you're seeing"),
    limit: z.number().optional().default(5).describe("Max results to return"),
  },
  async ({ query, limit }) => {
    const results = await tools.searchIssues({ query, limit });
    return {
      content: [{
        type: "text",
        text: JSON.stringify(results, null, 2),
      }],
    };
  }
);

server.tool(
  "add_issue",
  "Add a new known issue to the registry. Only use for bugs that took 4+ attempts to solve and are likely to recur (not one-off setup mistakes).",
  {
    title: z.string().describe("Short descriptive title"),
    symptom: z.string().describe("What the user sees or what fails"),
    root_cause: z.string().describe("Why it actually happens"),
    fix: z.string().describe("The working solution, with code if applicable"),
    failed_approaches: z.array(z.string()).optional().default([]).describe("What was tried and didn't work"),
    attempts: z.number().describe("Number of attempts before solving"),
    tags: z.array(z.string()).describe("Technology tags for categorization"),
    source_project: z.string().describe("Project where this was discovered"),
  },
  async (input) => {
    const result = await tools.addIssue({
      ...input,
      failed_approaches: input.failed_approaches ?? [],
    });
    return {
      content: [{
        type: "text",
        text: JSON.stringify(result),
      }],
    };
  }
);

server.tool(
  "list_issues",
  "Browse known issues, optionally filtered by technology tag.",
  {
    tag: z.string().optional().describe("Filter by tag (e.g. 'swiftui', 'react')"),
    limit: z.number().optional().default(20).describe("Max results to return"),
  },
  async ({ tag, limit }) => {
    const results = await tools.listIssues({ tag, limit });
    return {
      content: [{
        type: "text",
        text: JSON.stringify(results, null, 2),
      }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

**Step 2: Build and verify no compile errors**

```bash
npx tsc
```

Expected: Clean build, no errors

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add MCP server entry point with stdio transport"
```

---

### Task 6: Seed Script

**Files:**
- Create: `src/seed.ts`

**Step 1: Write the seed script**

Create `src/seed.ts`:

```typescript
import { createDatabase } from "./db.js";
import { createEmbeddingClient, buildEmbeddingText } from "./embeddings.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "..", "data", "aissues.db");
const knownIssuesPath = path.resolve(
  process.env.HOME ?? "~",
  ".claude/knowledge/known-issues.md"
);

interface ParsedIssue {
  title: string;
  symptom: string;
  root_cause: string;
  fix: string;
  failed_approaches: string[];
  attempts: number;
  tags: string[];
  source_project: string;
}

function parseKnownIssues(markdown: string): ParsedIssue[] {
  const issues: ParsedIssue[] = [];
  const sections = markdown.split(/^### /gm).filter((s) => s.trim());

  for (const section of sections) {
    const lines = section.trim();

    const titleMatch = lines.match(/^KI-\d+:\s*(.+)/);
    if (!titleMatch) continue;

    const getField = (name: string): string => {
      const regex = new RegExp(`\\*\\*${name}:\\*\\*\\s*([\\s\\S]*?)(?=\\n- \\*\\*|$)`);
      const match = lines.match(regex);
      return match ? match[1].trim() : "";
    };

    const tagsRaw = getField("Tags");
    const tags = tagsRaw
      .replace(/`/g, "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const attemptsRaw = getField("Attempts");
    const attempts = parseInt(attemptsRaw.replace(/[^0-9]/g, ""), 10) || 4;

    const failedRaw = getField("Failed attempts") || getField("Failed approaches");
    const failed_approaches = failedRaw
      ? failedRaw
          .split(/\n\s*\d+\.\s*/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    const sourceRaw = getField("Source");
    const source_project = sourceRaw.split(",")[0].trim();

    issues.push({
      title: titleMatch[1].trim(),
      symptom: getField("Symptom"),
      root_cause: getField("Root Cause"),
      fix: getField("Fix"),
      failed_approaches,
      attempts,
      tags,
      source_project,
    });
  }

  return issues;
}

async function main() {
  console.error(`Reading known issues from: ${knownIssuesPath}`);
  const markdown = readFileSync(knownIssuesPath, "utf-8");
  const issues = parseKnownIssues(markdown);
  console.error(`Parsed ${issues.length} issues`);

  const db = createDatabase(dbPath);
  const embedder = createEmbeddingClient();

  for (const issue of issues) {
    const text = buildEmbeddingText(issue);
    console.error(`Generating embedding for: ${issue.title}`);
    const embedding = await embedder.embed(text);
    const id = db.insertIssue(issue, embedding);
    console.error(`  Inserted as ${id}`);
  }

  console.error("Seed complete!");
  db.close();
}

main();
```

**Step 2: Build**

```bash
npx tsc
```

Expected: Clean build

**Step 3: Commit**

```bash
git add src/seed.ts
git commit -m "feat: add seed script to import existing known-issues.md"
```

---

### Task 7: Vitest Config

**Files:**
- Create: `vitest.config.ts`

**Step 1: Create vitest config**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
```

**Step 2: Run all tests**

```bash
npx vitest run
```

Expected: All tests pass (7 total: 3 from db, 1 from embeddings, 3 from tools)

**Step 3: Commit**

```bash
git add vitest.config.ts
git commit -m "chore: add vitest config"
```

---

### Task 8: Integration Test — Build, Seed, and Verify

**Step 1: Build the project**

```bash
cd /Users/emil.ryden/code/aissuesDB
npm run build
```

Expected: Clean compile

**Step 2: Create data directory and seed**

Ensure `VOYAGE_API_KEY` is set, then:

```bash
mkdir -p data
VOYAGE_API_KEY=<key> npm run seed
```

Expected: Output showing 6 issues parsed and inserted

**Step 3: Verify the MCP server starts**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}' | VOYAGE_API_KEY=<key> node dist/index.js
```

Expected: JSON response with server capabilities including the 3 tools

**Step 4: Commit everything clean**

```bash
git add -A
git commit -m "chore: integration verified — build, seed, and server startup working"
```

---

### Task 9: Claude Code Integration

**Step 1: Add MCP server config to Claude settings**

Add to `~/.claude/settings.json` under `mcpServers`:

```json
{
  "mcpServers": {
    "aissuesDB": {
      "command": "node",
      "args": ["/Users/emil.ryden/code/aissuesDB/dist/index.js"],
      "env": {
        "VOYAGE_API_KEY": "<your-voyage-api-key>"
      }
    }
  }
}
```

**Step 2: Update CLAUDE.md knowledge system instructions**

Replace the "When to Read Knowledge" section in `~/.claude/CLAUDE.md` to use the MCP tools instead of reading the markdown file directly. Keep the "When to Write Knowledge" section but update it to use `add_issue` instead of editing the markdown file.

**Step 3: Verify by restarting Claude Code and testing**

Start a new Claude Code session and verify the `aissuesDB` tools appear. Test with:
- `search_issues` with a query like "SwiftUI button crash"
- `list_issues` with tag "swiftui"

**Step 4: Commit CLAUDE.md changes**

```bash
cd /Users/emil.ryden && git add .claude/CLAUDE.md
git commit -m "docs: update knowledge system to use aissuesDB MCP server"
```
