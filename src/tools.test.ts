import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
