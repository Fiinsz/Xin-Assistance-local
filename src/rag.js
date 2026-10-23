import { randomUUID } from "node:crypto";
import {
  addKnowledgeChunk,
  deleteKnowledgeDocument,
  getKnowledgeChunks,
  listKnowledgeDocuments
} from "./database.js";

const OLLAMA_EMBED_MODEL =
  process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
const CHUNK_WORDS = 450;
const CHUNK_OVERLAP = 60;
const MAX_RESULTS = 4;
const MIN_SCORE = 0.2;

function splitIntoChunks(text) {
  const words = text.trim().split(/\s+/);
  const chunks = [];
  const step = CHUNK_WORDS - CHUNK_OVERLAP;

  for (let start = 0; start < words.length; start += step) {
    const chunk = words.slice(start, start + CHUNK_WORDS).join(" ");
    if (chunk) {
      chunks.push(chunk);
    }
    if (start + CHUNK_WORDS >= words.length) {
      break;
    }
  }

  return chunks;
}

async function requestEmbedding(text, ollamaBaseUrl) {
  const response = await fetch(`${ollamaBaseUrl}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_EMBED_MODEL,
      input: text
    }),
    signal: AbortSignal.timeout(120000)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Embedding model "${OLLAMA_EMBED_MODEL}" returned HTTP ${response.status}: ${body}`
    );
  }

  const data = await response.json();
  const embedding = Array.isArray(data.embeddings)
    ? data.embeddings[0]
    : data.embedding;
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error("Ollama returned an invalid embedding.");
  }
  return embedding;
}

function cosineSimilarity(left, right) {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }

  const denominator = Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude);
  return denominator === 0 ? 0 : dot / denominator;
}

export async function ingestKnowledgeDocument({
  title,
  source = title,
  content,
  ollamaBaseUrl
}) {
  if (
    typeof title !== "string" ||
    !title.trim() ||
    typeof content !== "string" ||
    !content.trim()
  ) {
    throw new Error("Knowledge title and content are required.");
  }

  const documentId = randomUUID();
  const chunks = splitIntoChunks(content);
  for (const chunk of chunks) {
    const embedding = await requestEmbedding(chunk, ollamaBaseUrl);
    addKnowledgeChunk(
      documentId,
      title.trim(),
      typeof source === "string" && source.trim() ? source.trim() : title.trim(),
      chunk,
      embedding
    );
  }

  return { documentId, chunkCount: chunks.length };
}

export async function retrieveKnowledge(query, ollamaBaseUrl) {
  const queryEmbedding = await requestEmbedding(query, ollamaBaseUrl);
  const matches = [];

  for (const row of getKnowledgeChunks()) {
    let embedding;
    try {
      embedding = JSON.parse(row.embedding);
    } catch {
      continue;
    }
    if (!Array.isArray(embedding)) {
      continue;
    }

    const score = cosineSimilarity(queryEmbedding, embedding);
    if (score >= MIN_SCORE) {
      matches.push({ ...row, score });
    }
  }

  return matches.sort((left, right) => right.score - left.score).slice(0, MAX_RESULTS);
}

export {
  deleteKnowledgeDocument,
  listKnowledgeDocuments,
  OLLAMA_EMBED_MODEL
};
