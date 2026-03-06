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
