# Local RAG

The chatbot now supports local retrieval-augmented generation (RAG):

1. A document is split into overlapping text chunks.
2. Each chunk is embedded with Ollama.
3. Embeddings are stored in SQLite.
4. A chat question is embedded and compared with stored chunks using cosine similarity.
5. The best matches are added to Ollama as reference material.

Retrieved text is explicitly marked as reference material and is not allowed to
override Xin's system rules.

## Setup

Install and run the embedding model once:

```powershell
ollama pull nomic-embed-text
```

The model can be changed with:

```powershell
$env:OLLAMA_EMBED_MODEL="nomic-embed-text"
```

## Add a document

With the Node server running:

```powershell
Invoke-RestMethod `
  -Uri http://127.0.0.1:3000/api/knowledge `
  -Method Post `
  -ContentType "application/json" `
  -Body (@{
    title = "Project notes"
    source = "project-notes.txt"
    content = "Your trusted local information goes here."
  } | ConvertTo-Json)
```

The response contains a `documentId`. List indexed documents with:

```text
GET /api/knowledge
```

Delete one with:

```text
DELETE /api/knowledge/:documentId
```

If the embedding model is unavailable, normal chat still works and retrieval is
skipped with a server warning.
