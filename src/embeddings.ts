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
