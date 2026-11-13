-- Turn on pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- One row per piece of text, plus its embedding.
-- 384 must match the embedding model (all-MiniLM-L6-v2 = 384 dimensions).
-- UNIQUE(content) prevents the same text from being inserted twice.
CREATE TABLE IF NOT EXISTS documents (
    id         BIGSERIAL PRIMARY KEY,
    content    TEXT NOT NULL UNIQUE,
    embedding  VECTOR(384) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- HNSW index = fast approximate nearest-neighbor search.
-- vector_cosine_ops matches the cosine operator (<=>) we use in queries.
-- m = max connections per node. Higher = better recall, larger index, slower builds.
-- ef_construction = candidate list size during build. Higher = better recall, slower builds.
-- Drop first so the WITH parameters take effect even if the index already exists
-- (Postgres has no ALTER INDEX for HNSW build parameters).
DROP INDEX IF EXISTS documents_embedding_idx;
CREATE INDEX documents_embedding_idx
ON documents USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- If the documents table already existed without UNIQUE(content), add it now.
-- This prevents duplicate content rows on repeated inserts.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'documents'::regclass
          AND contype = 'u'
          AND conname = 'documents_content_key'
    ) THEN
        ALTER TABLE documents ADD CONSTRAINT documents_content_key UNIQUE (content);
    END IF;
END $$;

-- Keep table statistics current so PostgreSQL's query planner picks the HNSW
-- index instead of scanning every row.
ANALYZE documents;

-- Optional: raise the default search depth so results are more accurate.
-- Default is usually 40; 100 gives better recall at the cost of speed.
-- Uncomment if you notice relevant documents missing from top results:
--
-- ALTER DATABASE vectordb01 SET hnsw.ef_search = 100;
