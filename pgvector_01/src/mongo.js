// src/mongo.js: raw MongoDB driver connection (no Mongoose).
import { MongoClient } from "mongodb";
import "dotenv/config"; // loads variables from .env into process.env

// Connection URI. Defaults to local MongoDB on port 27017, database "vectordb01".
const uri = process.env.MONGODB_URL || "mongodb://localhost:27017/vectordb01";
const client = new MongoClient(uri);

let dbPromise = null;

// Get (and lazily connect) the database.
export function getDb() {
    if (!dbPromise) {
        dbPromise = client.connect().then(() => {
            console.log("Connected to MongoDB.");
            return client.db();
        });
    }
    return dbPromise;
}

// Explicit connect helper (used at server startup).
export async function connectMongo() {
    await getDb();
}

// Close the MongoDB client (used during graceful shutdown).
export async function closeMongo() {
    if (dbPromise) {
        const db = await dbPromise;
        await db.client.close();
        console.log("MongoDB connection closed.");
        dbPromise = null;
    }
}
