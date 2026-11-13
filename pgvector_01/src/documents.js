// src/documents.js: all SQL lives here, so routes stay clean.
import { pool } from "./db.js";
import { embed } from "./embeddings.js";

// pgvector accepts vectors as text like "[0.1,0.2,...]".
// JSON.stringify on an array produces exactly that format.
const toVector = (array) => JSON.stringify(array);

// Save a text and its embedding.
// If the exact same content already exists, we update its embedding and
// created_at instead of creating a duplicate row (idempotent insert).
export async function addDocument(content) {
    if (typeof content !== "string" || content.trim() === "") {
        throw new Error("content must be a non-empty string");
    }

    // Turn the text into a 384-dim vector using the same model used at search time.
    const embedding = await embed(content);

    const { rows } = await pool.query(
        `INSERT INTO documents (content, embedding)
     VALUES ($1, $2::vector)
     ON CONFLICT (content) DO UPDATE
        SET embedding = EXCLUDED.embedding,
            created_at = NOW()
     RETURNING id, content, created_at`,
        [content.trim(), toVector(embedding)]
    );

    return rows[0];
}

// Save many texts at once. One transaction means either all are inserted
// or none are, and it's much faster than calling addDocument in a loop.
export async function addDocuments(contents) {
    if (!Array.isArray(contents) || contents.length === 0) {
        throw new Error("contents must be a non-empty array");
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const inserted = [];
        for (const content of contents) {
            const embedding = await embed(content);
            const { rows } = await client.query(
                `INSERT INTO documents (content, embedding)
             VALUES ($1, $2::vector)
             ON CONFLICT (content) DO UPDATE
                SET embedding = EXCLUDED.embedding,
                    created_at = NOW()
             RETURNING id, content, created_at`,
                [content.trim(), toVector(embedding)]
            );
            inserted.push(rows[0]);
        }

        await client.query("COMMIT");
        return inserted;
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }
}

// Find the documents closest in meaning to the query.
// Uses cosine distance (<=>), which is what the HNSW index was built for.
export async function searchDocuments(query, limit = 5) {
    if (typeof query !== "string" || query.trim() === "") {
        throw new Error("query must be a non-empty string");
    }

    // Clamp limit to a sane range so nobody accidentally requests 10k rows.
    const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), 100);

    // IMPORTANT: embed the query with the SAME model used for storing.
    const queryEmbedding = await embed(query);

    const { rows } = await pool.query(
        `SELECT id,
            content,
            1 - (embedding <=> $1::vector) AS similarity  -- cosine similarity (1 = identical)
     FROM documents
     ORDER BY embedding <=> $1::vector                    -- smallest distance = closest match
     LIMIT $2`,
        [toVector(queryEmbedding), safeLimit]
    );

    return rows;
}
