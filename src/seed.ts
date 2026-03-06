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
