export const FAQ_EMBEDDING_MODEL = "gemini-embedding-2";
export const FAQ_EMBEDDING_DIMENSIONS = 768;

type FetchImplementation = typeof fetch;

type EmbeddingPayload = {
  embedding?: {
    values?: unknown;
  };
  embeddings?: Array<{
    values?: unknown;
  }>;
};

export function buildFaqDocumentEmbeddingText(
  question: string,
  answer: string,
) {
  return `title: ${question.trim()} | text: ${answer.trim()}`;
}

export function buildFaqQueryEmbeddingText(query: string) {
  return `task: question answering | query: ${query.trim()}`;
}

function extractEmbedding(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Gemini returned an invalid embedding.");
  }

  const response = payload as EmbeddingPayload;
  const values =
    response.embedding?.values ?? response.embeddings?.[0]?.values;

  if (
    !Array.isArray(values) ||
    values.length !== FAQ_EMBEDDING_DIMENSIONS ||
    !values.every(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value),
    )
  ) {
    throw new Error("Gemini returned an invalid embedding.");
  }

  return values;
}

export async function generateFaqEmbedding(
  text: string,
  fetchImplementation: FetchImplementation = fetch,
) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Gemini embeddings are not configured.");
  }

  const response = await fetchImplementation(
    `https://generativelanguage.googleapis.com/v1beta/models/${FAQ_EMBEDDING_MODEL}:embedContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        content: {
          parts: [{ text }],
        },
        output_dimensionality: FAQ_EMBEDDING_DIMENSIONS,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    },
  );
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error("Gemini could not generate an embedding.");
  }

  return extractEmbedding(payload);
}
