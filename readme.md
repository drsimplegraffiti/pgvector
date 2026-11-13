# pgvector crash course

**pgvector** is a Postgres extension that lets you store and search *vectors*
inside a normal database, so you can do "find things similar in meaning" instead
of just exact keyword matches.

This repository is a small Node.js/Express app that demonstrates pgvector:
embed text locally with a Hugging Face model, store the vectors in Postgres, and
search them with cosine similarity.

---

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Docker](https://www.docker.com/) + Docker Compose, or a running Postgres
  with the [pgvector](https://github.com/pgvector/pgvector) extension

## Run it

### 1. Install dependencies

```bash
npm install
```

### 2. Start Postgres with pgvector

```bash
docker compose up -d
```

This starts `pgvector/pgvector:pg16` mapped to `localhost:5439` and applies
`sql/init.sql` on first creation. The database is `vectordb` with user/password
`postgres`.

If port 5439 is taken, change the left side of the port mapping in
`docker-compose.yml` (e.g. `"5433:5432"`) and update `DATABASE_URL` in `.env`.

### 3. Configure

Copy the example env file and adjust if needed:

```bash
cp .env.example .env
```

`PORT` — server port (default 3000).
`DATABASE_URL` — Postgres connection string (default points at the docker container on 5439).

### 4. Start the server

```bash
npm start        # plain start
npm run dev      # auto-restart on change (node --watch)
```

The first start downloads the embedding model (~50 MB), so it may take a minute.
You should see:

```
Loading embedding model...
Server running on http://localhost:3000
```

### 5. Reset the database

`init.sql` only runs the first time the container is created. To start over:

```bash
docker compose down -v && docker compose up -d
```

---

## Key terms

**Vector**: just a list of numbers, e.g. `[0.12, -0.8, 0.33, ...]`. Think of it
as a point in space. Real embedding vectors have hundreds or thousands of
dimensions.

**Embedding**: a vector that represents the *meaning* of something (text, image,
audio). An embedding model turns "how do I reset my password" into, say, 384
numbers. Texts with similar meaning land close together in that space; unrelated
ones land far apart.

**Dimensions**: how many numbers per vector. Fixed by the model. This app uses
`all-MiniLM-L6-v2`, which outputs 384 dimensions. Every vector in the column
must have the same count.

**Distance / similarity**:

- **Cosine distance** (`<=>`): compares the *angle* between vectors, ignoring
  length. Default for text embeddings. Cosine *similarity* = `1 - distance`.
- **L2 / Euclidean** (`<->`): straight-line distance.
- **Inner product** (`<#>`): dot product (pgvector negates it so smaller = closer).

**Semantic search**: embed the user's query, then find the nearest stored
embeddings.

---

## API reference

Base URL: `http://localhost:3000`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Liveness check |
| POST | `/documents` | Store one piece of text with its embedding |
| POST | `/upload` | Upload a `.txt`/`.md` file; it is chunked, embedded, and stored |
| GET | `/search?q=...` | Semantic search for chunks closest to the query |
| GET | `/sources` | List uploaded files and their chunk counts |
| DELETE | `/sources/:name` | Delete a file and all its chunks |

### POST /documents

```bash
curl -X POST localhost:3000/documents -H "Content-Type: application/json" \
  -d '{"content": "To reset your password, click Forgot Password on the login page."}'
```

Body: `{ "content": "string" }` (required, non-empty).

Returns the inserted row `{ id, content }`, status 201.

### POST /upload

```bash
curl -F "file=@notes.txt" localhost:3000/upload
# {"source":"notes.txt","chunks":1}
```

Multipart form, field name `file`. Accepts `.txt` and `.md`, max 2 MB.
Re-uploading the same file name replaces its old chunks.

### GET /search

```bash
curl "localhost:3000/search?q=I%20forgot%20my%20login%20credentials"
```

Query params:
- `q` (required) — natural-language query
- `limit` (optional, 1–20, default 5)
- `source` (optional) — only search inside this file

Returns chunks ordered by similarity (highest first), each with
`id, source, chunk_index, content, similarity`.

### GET /sources

```bash
curl localhost:3000/sources
# [{"source":"notes.txt","chunks":1}]
```

### DELETE /sources/:name

```bash
curl -X DELETE localhost:3000/sources/notes.txt
# {"deletedChunks":1}
```

---

## Example walkthrough

Store some facts, then search with different words (semantic search):

```bash
curl -X POST localhost:3000/documents -H "Content-Type: application/json" \
  -d '{"content": "To reset your password, click Forgot Password on the login page."}'

curl -X POST localhost:3000/documents -H "Content-Type: application/json" \
  -d '{"content": "Our office is open Monday to Friday, 9am to 5pm."}'

curl "localhost:3000/search?q=I%20forgot%20my%20login%20credentials"
```

The password document comes back first with the highest similarity, even though
the query shares almost no words with it.

Or upload a file:

```bash
curl -F "file=@notes.txt" localhost:3000/upload
curl "localhost:3000/search?q=how long do I wait for my money back"
```

A short file becomes one chunk. Upload a longer text file (an article or a
README) to see chunking in action.

---

## Project structure

```
src/
  db.js             - Postgres connection pool (pg)
  documents.js      - SQL layer: add/search/list/delete documents and chunks
  embeddings.js     - Local embedding model (@huggingface/transformers), loaded once
  server.js         - Express app: routes, upload handling, error handler
  utils/
    chunker.js      - Splits text into overlapping chunks for embedding
sql/
  init.sql          - Schema: pgvector extension, documents table, HNSW index
.env                - Runtime config (PORT, DATABASE_URL)
.env.example        - Template to copy
docker-compose.yml  - Postgres + pgvector container
package.json        - Dependencies and scripts
```

- `documents.js` is the single source of truth for SQL; `server.js` only
  handles HTTP concerns.
- `documentsv2.js` was a duplicate of `documents.js` and has been removed.

---

## How it works

```
POST /documents   -> text -> embed() -> 384 numbers -> INSERT into Postgres
POST /upload      -> file -> chunkText() -> embed each chunk -> INSERT (transaction)
GET  /search      -> query -> embed() -> 384 numbers -> ORDER BY <=> -> top K rows
```

The model (`Xenova/all-MiniLM-L6-v2`) is loaded once at startup and reused for
every request; the first request triggers the model download.

Use the **same** embedding model for stored data and queries — mixing models
produces meaningless similarity. Changing models means re-embedding everything.

---

## Indexes (speed vs accuracy)

Without an index, Postgres compares against every row (exact but slow at scale).
`init.sql` creates an HNSW index on `embedding` using `vector_cosine_ops`,
which matches the cosine operator (`<=>`) used in searches.

- **HNSW**: graph-based, better speed/recall, slower to build, more memory.
- **IVFFlat**: clusters vectors; faster to build, recall depends on tuning.

The operator class must match the distance metric: `vector_cosine_ops`,
`vector_l2_ops`, or `vector_ip_ops`.

> Dimension limit: `vector` can be indexed up to **2,000 dimensions**. For
> larger embeddings use `halfvec` (up to 4,000 dims), reduce dimensions, or skip
> the index.
