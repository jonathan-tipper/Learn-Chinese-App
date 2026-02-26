import { env } from "@/lib/env";

/**
 * Generate a 1536-dimensional embedding vector for the given text using the
 * Venice OpenAI-compatible embeddings endpoint.
 *
 * Returns null if Venice is unavailable or the API call fails — callers should
 * gracefully fall back to recency-based memory retrieval in that case.
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!env.veniceApiKey || !env.veniceEmbeddingModel) {
    return null;
  }

  try {
    const response = await fetch(`${env.veniceBaseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.veniceApiKey}`
      },
      body: JSON.stringify({
        model: env.veniceEmbeddingModel,
        input: text
      })
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };

    const embedding = payload.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length !== 1536) {
      return null;
    }

    return embedding;
  } catch {
    return null;
  }
}
