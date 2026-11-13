// src/embeddings.js: turns text into a vector, locally.
import { pipeline } from "@huggingface/transformers";

// Free, local embedding model. Outputs 384-dimension vectors.
const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";

// We load the model once and reuse it. Loading is slow (the first run
// also downloads the model), so we never want to do it per request.
let extractorPromise = null;

function getExtractor() {
    if (!extractorPromise) {
        extractorPromise = pipeline("feature-extraction", MODEL_NAME);
    }
    return extractorPromise;
}

// Converts a string into an array of 384 numbers.
export async function embed(text) {
    const extractor = await getExtractor();

    // pooling: "mean"  -> combine per-token vectors into ONE vector for the text
    // normalize: true  -> scale the vector to length 1 (good for cosine search)
    const output = await extractor(text, { pooling: "mean", normalize: true });

    // output.data is a typed array; convert it to a normal JS array
    return Array.from(output.data);
}

// Warm-up helper so the model is ready before the first request.
export async function warmUp() {
    await getExtractor();
}
