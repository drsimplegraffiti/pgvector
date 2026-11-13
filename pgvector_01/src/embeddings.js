// src/embeddings.js: turns text into vectors, locally.
import { pipeline } from "@huggingface/transformers";

// Free, local embedding model. Outputs 384-dimension vectors.
// Keep this in sync with VECTOR(384) in sql/init.sql.
const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";

// We load the model once and reuse it. Loading is slow (the first run
// also downloads the model), so we never want to do it per request.
let extractorPromise = null;

function getExtractor() {
    if (!extractorPromise) {
        extractorPromise = pipeline("feature-extraction", MODEL_NAME).catch((err) => {
            console.error("Failed to load embedding model:", err.message);
            throw err;
        });
    }
    return extractorPromise;
}

// Converts a string into an array of 384 numbers.
export async function embed(text) {
    if (typeof text !== "string" || text.trim() === "") {
        throw new Error("text must be a non-empty string");
    }

    const extractor = await getExtractor();

    // pooling: "mean"  -> combine per-token vectors into ONE vector for the text
    // normalize: true  -> scale the vector to length 1 (good for cosine search)
    const output = await extractor(text, { pooling: "mean", normalize: true });

    // output.data is a typed array; convert it to a normal JS array
    return Array.from(output.data);
}

// Embeds many texts at once. Much faster than calling embed() in a loop
// because the model processes the batch in a single forward pass.
export async function embedBatch(texts) {
    if (!Array.isArray(texts) || texts.length === 0) {
        throw new Error("texts must be a non-empty array");
    }

    const extractor = await getExtractor();

    const output = await extractor(texts, { pooling: "mean", normalize: true });

    // output.data is a flat typed array: [doc1_dim1, doc1_dim2, ..., doc2_dim1, ...]
    const dim = output.data.length / texts.length;
    const vectors = [];
    for (let i = 0; i < texts.length; i++) {
        vectors.push(Array.from(output.data.slice(i * dim, (i + 1) * dim)));
    }
    return vectors;
}

// Warm-up helper so the model is ready before the first request.
export async function warmUp() {
    await getExtractor();
}
