import express from "express";
import "dotenv/config";
import { warmUp } from "./embeddings.js";
import { addDocument, addDocuments, searchDocuments } from "./documents.js";
import { pool, checkDatabaseConnection } from "./db.js";
import { connectMongo, closeMongo, getDb } from "./mongo.js";
import { createProduct } from "./products.js";
import { searchProducts } from "./search.js";

const app = express();
app.use(express.json()); // lets us read JSON request bodies

// Simple request log: helps us see traffic and debug issues during development.
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()}  ${req.method} ${req.url}`);
    next();
});

// Health check: confirms both the server, Postgres, and MongoDB are reachable.
app.get("/health", async (req, res) => {
    let pgOk = false;
    let mongoOk = false;

    try {
        pgOk = await checkDatabaseConnection();
    } catch (err) {
        console.error("Postgres health check failed:", err.message);
    }

    try {
        await getDb();
        mongoOk = true;
    } catch (err) {
        console.error("MongoDB health check failed:", err.message);
    }

    res.json({
        status: pgOk && mongoOk ? "ok" : "degraded",
        postgres: pgOk ? "connected" : "disconnected",
        mongodb: mongoOk ? "connected" : "disconnected",
    });
});

// POST /documents  { "content": "some text" }
// Embeds the text and stores it in pgvector only.
app.post("/documents", async (req, res) => {
    const { content } = req.body;

    if (typeof content !== "string" || content.trim() === "") {
        return res.status(400).json({ error: "content must be a non-empty string" });
    }

    try {
        const document = await addDocument(content.trim());
        res.status(201).json(document);
    } catch (err) {
        console.error("Failed to add document:", err.message);
        res.status(500).json({ error: "Could not store document" });
    }
});

// POST /documents/batch  { "contents": ["text one", "text two"] }
// Embeds and stores many texts in pgvector in a single transaction.
app.post("/documents/batch", async (req, res) => {
    const { contents } = req.body;

    if (!Array.isArray(contents) || contents.length === 0) {
        return res.status(400).json({ error: "contents must be a non-empty array" });
    }

    try {
        const documents = await addDocuments(contents);
        res.status(201).json(documents);
    } catch (err) {
        console.error("Failed to add documents batch:", err.message);
        res.status(500).json({ error: "Could not store documents" });
    }
});

// POST /products  { "productname": "...", "sku": "...", "qty": 10, ... }
// Saves to MongoDB (source of truth) and indexes concatenated text in pgvector.
app.post("/products", async (req, res) => {
    const { productname, sku, qty, description, price } = req.body;

    if (!productname || !sku) {
        return res.status(400).json({ error: "productname and sku are required" });
    }

    try {
        const product = await createProduct({
            productname,
            sku,
            qty,
            description,
            price,
        });
        res.status(201).json(product);
    } catch (err) {
        console.error("Failed to create product:", err.message);
        res.status(500).json({ error: "Could not create product" });
    }
});

// GET /search?q=your question&limit=5
// Semantic search via pgvector, then fetches full products from MongoDB.
app.get("/search", async (req, res) => {
    const query = req.query.q;

    if (typeof query !== "string" || query.trim() === "") {
        return res.status(400).json({ error: "query param 'q' is required" });
    }

    const limit = Math.min(Math.max(Number(req.query.limit) || 5, 1), 100);

    try {
        const products = await searchProducts(query.trim(), limit);
        res.json(products);
    } catch (err) {
        console.error("Product search failed:", err.message);
        res.status(500).json({ error: "Search failed" });
    }
});

// Error handler: Express forwards errors from async routes here.
app.use((err, req, res, next) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: "Something went wrong" });
});

// Graceful shutdown: finish current requests, then close DB pools.
let server = null;

async function shutdown(signal) {
    console.log(`\n${signal} received: shutting down gracefully...`);
    if (server) {
        server.close(() => console.log("HTTP server closed."));
    }
    try {
        await pool.end();
        console.log("Postgres pool closed.");
    } catch (err) {
        console.error("Error closing Postgres pool:", err.message);
    }
    try {
        await closeMongo();
    } catch (err) {
        console.error("Error closing MongoDB:", err.message);
    }
    process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Load the embedding model, verify Postgres + MongoDB, then start accepting requests.
const port = process.env.PORT || 3006;

console.log("Loading embedding model (first run downloads ~90 MB)...");
await warmUp();

try {
    await checkDatabaseConnection();
    console.log("Postgres connection verified.");
} catch (err) {
    console.error("Warning: could not verify Postgres connection:", err.message);
}

try {
    await connectMongo();
} catch (err) {
    console.error("Warning: could not connect to MongoDB:", err.message);
}

server = app.listen(port, () =>
    console.log(`Server running on http://localhost:${port}`)
);

// npm start


// What is Semantic Search ?
//
// Semantic search is a smarter way for computers to find information. Instead of just looking for exact words, it tries to understand what you mean. For example, if you search for “how to cook pasta,” a regular search might only look for pages with those exact words. But a semantic search understands that you’re looking for pasta recipes or steps to prepare pasta, even if those exact words aren’t used.
//