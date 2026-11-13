-- Turn on pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- One row per piece of text (or file chunk), plus its embedding.
-- 384 must match the embedding model (Xenova/all-MiniLM-L6-v2 = 384 dims).
-- `source` is the file name for uploaded chunks (NULL for manual adds),
-- `chunk_index` is the chunk's position inside the file.
CREATE TABLE IF NOT EXISTS documents (
    id          BIGSERIAL PRIMARY KEY,
    source      TEXT,            -- NULL for manually added documents
    chunk_index INT,             -- NULL for manually added documents
    content     TEXT NOT NULL,
    embedding   VECTOR(384) NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW()
);

-- HNSW index = fast approximate nearest-neighbor search.
-- vector_cosine_ops matches the cosine operator (<=>) used in queries.
CREATE INDEX IF NOT EXISTS documents_embedding_idx
ON documents USING hnsw (embedding vector_cosine_ops);

-- Backwards compatibility: add the columns to databases created by an older
-- init.sql that only had (id, content, embedding, created_at).
ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS source TEXT,
    ADD COLUMN IF NOT EXISTS chunk_index INT;
