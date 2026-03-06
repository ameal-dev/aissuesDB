import { describe, it, expect, vi } from "vitest";

vi.mock("voyageai", () => ({
  VoyageAIClient: vi.fn(),
}));

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
