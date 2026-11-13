// Why chunk? The embedding model reads only a limited amount of text (about 256
// tokens for this model), and one vector for a whole file is too blurry to
// search well. Small focused chunks give precise results.

// Default chunk size in characters. ~800 chars is roughly 200 tokens,
// which fits comfortably inside the embedding model's limit.
const MAX_CHARS = 800;

// Characters repeated at the start of the next chunk, so a sentence that
// falls on a boundary still has context on both sides.
const OVERLAP = 100;

// Splits one oversized paragraph into smaller pieces, sentence by sentence.
function splitLongText(text, maxChars) {
    if (text.length <= maxChars) return [text];

    // Match runs of text ending in . ! or ? (or the leftover tail).
    const sentences = text.match(/[^.!?]+[.!?]+\s*|[^.!?]+$/g) ?? [text];
    const pieces = [];

    for (const sentence of sentences) {
        if (sentence.length <= maxChars) {
            pieces.push(sentence.trim());
        } else {
            // A single giant sentence: cut it into fixed-size slices.
            for (let i = 0; i < sentence.length; i += maxChars) {
                pieces.push(sentence.slice(i, i + maxChars).trim());
            }
        }
    }
    return pieces;
}

// Main function: text in, array of chunk strings out.
export function chunkText(text, { maxChars = MAX_CHARS, overlap = OVERLAP } = {}) {
    // 1. Split into paragraphs (blank lines separate them), drop empty ones.
    const paragraphs = text
        .replace(/\r\n/g, "\n")
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean);

    // 2. Make sure no single piece is bigger than maxChars.
    const pieces = paragraphs.flatMap((p) => splitLongText(p, maxChars));

    // 3. Pack pieces together until a chunk is full, then start a new one.
    const chunks = [];
    let current = "";

    for (const piece of pieces) {
        const wouldOverflow = current && current.length + piece.length + 1 > maxChars;

        if (wouldOverflow) {
            chunks.push(current);
            // New chunk starts with the tail of the previous one (the overlap).
            current = current.slice(-overlap) + " " + piece;
        } else {
            current = current ? current + "\n" + piece : piece;
        }
    }

    if (current) chunks.push(current); // don't forget the last one
    return chunks;
}

