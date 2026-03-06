import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { createEmbeddingClient } from "./embeddings.js";
import { buildEmbeddingText } from "./embeddings.js";

describe("EmbeddingClient", () => {
  const mockEmbedding = Array.from({ length: 1024 }, (_, i) => i * 0.001);

  beforeAll(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ embedding: mockEmbedding }] }),
      })
    );
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("should generate a 1024-dim Float32Array from text", async () => {
    const client = createEmbeddingClient("test-key");
    const result = await client.embed("test query");

    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(1024);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.voyageai.com/v1/embeddings",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
        }),
      })
    );
  });
});

describe("buildEmbeddingText", () => {
  it("should concatenate issue fields", () => {
    const text = buildEmbeddingText({
      title: "Test",
      symptom: "breaks",
      root_cause: "bad code",
      tags: ["ts", "node"],
    });
    expect(text).toBe("Test breaks bad code ts node");
  });
});
