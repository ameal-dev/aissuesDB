export interface EmbeddingClient {
  embed(text: string): Promise<Float32Array>;
}

interface VoyageEmbedResponse {
  data: { embedding: number[] }[];
}

export function createEmbeddingClient(
  apiKey?: string
): EmbeddingClient {
  const key = apiKey ?? process.env.VOYAGE_API_KEY;
  if (!key) throw new Error("VOYAGE_API_KEY is required");

  return {
    async embed(text: string): Promise<Float32Array> {
      const maxRetries = 3;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const res = await fetch("https://api.voyageai.com/v1/embeddings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            input: text,
            model: "voyage-3-large",
            output_dimension: 1024,
          }),
        });
        if (res.status === 429 && attempt < maxRetries) {
          const wait = Math.pow(2, attempt + 1) * 10_000; // 20s, 40s, 80s
          console.error(`  Rate limited, retrying in ${wait / 1000}s...`);
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        if (!res.ok) {
          throw new Error(`Voyage API error: ${res.status} ${await res.text()}`);
        }
        const json = (await res.json()) as VoyageEmbedResponse;
        return new Float32Array(json.data[0].embedding);
      }
      throw new Error("Voyage API: max retries exceeded");
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
