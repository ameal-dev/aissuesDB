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
        type: "text" as const,
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
        type: "text" as const,
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
        type: "text" as const,
        text: JSON.stringify(results, null, 2),
      }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
