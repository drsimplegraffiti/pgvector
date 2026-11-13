// src/products.js: dual-write products to MongoDB + pgvector.
// sql/init.sql is left UNTOUCHED — we only call the existing addDocument().
import { getDb } from "./mongo.js";
import { addDocument } from "./documents.js";

// Save a product to MongoDB (source of truth) and its concatenated text
// embedding to pgvector (semantic search index).
export async function createProduct(product) {
    const db = await getDb();

    // 1. Insert into MongoDB.
    const result = await db.collection("products").insertOne({
        productname: product.productname,
        sku: product.sku,
        qty: Number(product.qty) || 0,
        description: product.description || "",
        price: Number(product.price) || 0,
        createdAt: new Date(),
    });

    const mongoId = result.insertedId.toString();

    // 2. Concatenate product details into ONE searchable text string.
    // We embed the MongoDB _id inside the content so we can look the product
    // back up after pgvector returns search results.
    const content = [
        `mongodb_id:${mongoId}`,
        `Product: ${product.productname}`,
        `SKU: ${product.sku}`,
        `Qty: ${product.qty}`,
        product.description ? `Description: ${product.description}` : "",
    ]
        .filter(Boolean)
        .join(" | ");

    // 3. Store the concatenated text + embedding in pgvector (existing table).
    // addDocument() uses ON CONFLICT (content) DO UPDATE, so re-saving the same
    // product text updates the embedding instead of creating duplicates.
    await addDocument(content);

    return { id: mongoId, ...product };
}
