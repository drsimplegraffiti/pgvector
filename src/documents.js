import { pool } from "./db.js";
import { embed } from "./embeddings.js";

// pgvector accepts vectors as text like "[0.1,0.2,...]".
// JSON.stringify on a number array produces exactly that format.
const toVector = (array) => JSON.stringify(array);

/**
 * Save a single piece of text (no file). Embeds it with the local model and
 * stores the resulting vector in the `documents` table.
 *
 * @param {string} content - Raw text to embed and store.
 * @returns {Promise<{id: number, content: string}>} The inserted row.
 */
export async function addDocument(content) {
    const embedding = await embed(content);

    const { rows } = await pool.query(
        `INSERT INTO documents (content, embedding)
     VALUES ($1, $2::vector)
     RETURNING id, content`,
        [content, toVector(embedding)]
    );
    return rows[0];
}

/**
 * Save all chunks of one file. Re-uploading the same file name replaces its
 * old chunks (no duplicates). Embeddings are generated before opening a DB
 * connection because embedding is the slow part.
 *
 * @param {string} source - File name the chunks came from.
 * @param {string[]} chunks - Text chunks to embed and store.
 * @returns {Promise<number>} Number of chunks stored.
 */
export async function addChunks(source, chunks) {
    const embeddings = [];
    for (const chunk of chunks) {
        embeddings.push(await embed(chunk));
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query("DELETE FROM documents WHERE source = $1", [source]);

        for (let i = 0; i < chunks.length; i++) {
            await client.query(
                `INSERT INTO documents (source, chunk_index, content, embedding)
             VALUES ($1, $2, $3, $4::vector)`,
                [source, i, chunks[i], toVector(embeddings[i])]
            );
        }

        await client.query("COMMIT");
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }

    return chunks.length;
}

/**
 * Find the chunks closest in meaning to the query.
 * If `source` is given, only search inside that file.
 *
 * @param {string} query - Natural-language search query.
 * @param {number} [limit=5] - Max results to return (1-20 enforced by the route).
 * @param {string|null} [source=null] - Optional file name filter.
 * @returns {Promise<Array<{id, source, chunk_index, content, similarity}>>}
 */
export async function searchDocuments(query, limit = 5, source = null) {
    const queryEmbedding = await embed(query);

    const { rows } = await pool.query(
        `SELECT id,
            source,
            chunk_index,
            content,
            1 - (embedding <=> $1::vector) AS similarity
     FROM documents
     WHERE ($3::text IS NULL OR source = $3)
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
        [toVector(queryEmbedding), limit, source]
    );
    return rows;
}

/**
 * List uploaded files and how many chunks each has.
 *
 * @returns {Promise<Array<{source: string, chunks: number}>>}
 */
export async function listSources() {
    const { rows } = await pool.query(
        `SELECT source, COUNT(*)::int AS chunks
     FROM documents
     WHERE source IS NOT NULL
     GROUP BY source
     ORDER BY source`
    );
    return rows;
}

/**
 * Delete every chunk of a file.
 *
 * @param {string} source - File name whose chunks should be removed.
 * @returns {Promise<number>} Number of rows removed.
 */
export async function deleteSource(source) {
    const { rowCount } = await pool.query(
        "DELETE FROM documents WHERE source = $1",
        [source]
    );
    return rowCount;
}
