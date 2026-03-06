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
    const emb3 = new Float32Array(1024).fill(0.15);

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

    // Query close to emb3 (0.15) and emb1 (0.1), far from emb2 (0.9)
    const query = new Float32Array(1024).fill(0.15);
    const results = db.searchByVector(query, 2);

    expect(results).toHaveLength(2);
    expect(results[0].title).toBe("Issue C");
    expect(results[1].title).toBe("Issue A");
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
