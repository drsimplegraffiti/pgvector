import express from "express";
import multer from "multer";
import path from "node:path";
import "dotenv/config";
import { warmUp } from "./embeddings.js";
import { chunkText } from "./utils/chunker.js";
import {
    addDocument,
    addChunks,
    searchDocuments,
    listSources,
    deleteSource,
} from "./documents.js";

const app = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// File upload setup
// memoryStorage keeps the file in RAM (req.file.buffer): no temp files to clean up.
const ALLOWED_EXTENSIONS = [".txt", ".md"];

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB max
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ALLOWED_EXTENSIONS.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error("Only .txt and .md files are allowed"));
        }
    },
});

// ---------------------------------------------------------------------------
// Routes

/**
 * GET /health
 * Liveness check.
 */
app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});

/**
 * POST /documents
 * Body: { "content": "..." }
 * Embeds a single piece of text and stores it.
 */
app.post("/documents", async (req, res) => {
    const { content } = req.body;
    if (typeof content !== "string" || content.trim() === "") {
        return res.status(400).json({ error: "content must be a non-empty string" });
    }
    const document = await addDocument(content.trim());
    res.status(201).json(document);
});

/**
 * POST /upload
 * Multipart form, field name "file" (.txt or .md, max 2 MB).
 * Reads the file, splits it into chunks, embeds each chunk, stores them.
 * Re-uploading the same file name replaces its old chunks.
 */
app.post("/upload", upload.single("file"), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "Attach a file in the 'file' field" });
    }

    // basename strips any folder parts, so "../../x.txt" can't sneak through.
    const source = path.basename(req.file.originalname);
    const text = req.file.buffer.toString("utf-8");

    const chunks = chunkText(text);
    if (chunks.length === 0) {
        return res.status(400).json({ error: "The file has no text" });
    }

    const count = await addChunks(source, chunks);
    res.status(201).json({ source, chunks: count });
});

/**
 * GET /search?q=...&limit=5&source=notes.txt
 * Embeds the query and returns the closest stored chunks.
 * `source` is optional; when given, only that file is searched.
 */
app.get("/search", async (req, res) => {
    const query = req.query.q;
    if (typeof query !== "string" || query.trim() === "") {
        return res.status(400).json({ error: "query param 'q' is required" });
    }

    const limit = Math.min(Math.max(Number(req.query.limit) || 5, 1), 20);
    const source = typeof req.query.source === "string" ? req.query.source : null;

    const results = await searchDocuments(query.trim(), limit, source);
    res.json(results);
});

/**
 * GET /sources
 * Lists uploaded files and their chunk counts.
 */
app.get("/sources", async (_req, res) => {
    res.json(await listSources());
});

/**
 * DELETE /sources/:name
 * Removes a file and all its chunks.
 */
app.delete("/sources/:name", async (req, res) => {
    const deleted = await deleteSource(req.params.name);
    if (deleted === 0) {
        return res.status(404).json({ error: "No such source" });
    }
    res.json({ deletedChunks: deleted });
});

app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
});

app.use((err, _req, res, _next) => {
    // Upload problems (file too large, wrong type) are the client's fault: 400.
    if (err instanceof multer.MulterError || err.message?.startsWith("Only .txt")) {
        return res.status(400).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
});

const port = process.env.PORT || 3000;

console.log("Loading embedding model...");
await warmUp();

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
