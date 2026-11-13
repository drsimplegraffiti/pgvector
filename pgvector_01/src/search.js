// src/search.js: semantic search via pgvector, then fetch full products from MongoDB.
// sql/init.sql and src/documents.js are left UNTOUCHED.
import { getDb } from "./mongo.js";
import { searchDocuments } from "./documents.js";
import { ObjectId } from "mongodb";

// Search products semantically using pgvector, then hydrate with MongoDB data.
export async function searchProducts(query, limit = 5) {
    // 1. pgvector finds the closest matching embedded texts.
    const results = await searchDocuments(query, limit);

    // 2. Parse the mongodb_id we stored inside each content string.
    const mongoIds = results
        .map((r) => {
            const match = r.content.match(/mongodb_id:([^\|]+)/);
            return match ? match[1].trim() : null;
        })
        .filter(Boolean);

    // 3. Fetch the full product documents from MongoDB using those IDs.
    const db = await getDb();
    const products = await db
        .collection("products")
        .find({ _id: { $in: mongoIds.map((id) => new ObjectId(id)) } })
        .toArray();

    // 4. Attach the pgvector similarity score back onto each MongoDB product.
    const byId = new Map();
    for (const r of results) {
        const match = r.content.match(/mongodb_id:([^\|]+)/);
        if (match) {
            byId.set(match[1].trim(), r.similarity);
        }
    }

    return products
        .map((p) => ({
            ...p,
            similarity: byId.get(p._id.toString()),
        }))
        .sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
}
