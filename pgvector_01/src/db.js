import pg from "pg";
import "dotenv/config"; // loads variables from .env into process.env

// A pool keeps several connections open and reuses them,
// which is faster than connecting on every request.
export const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,

    // Pool tuning: cap max connections so we don't overwhelm Postgres,
    // and keep a few idle so the first request isn't slow.
    max: Number(process.env.PG_POOL_MAX) || 10,
    min: Number(process.env.PG_POOL_MIN) || 2,
    // Close idle connections after 30 seconds.
    idleTimeoutMillis: 30000,
    // Give up waiting for a connection after 5 seconds.
    connectionTimeoutMillis: 5000,
});

// Log pool errors so we notice if the database goes away.
pool.on("error", (err) => {
    console.error("Unexpected database pool error:", err.message);
});

// Log when a new connection is established (helpful during startup/debugging).
pool.on("connect", () => {
    console.log("New database connection established.");
});

// Quick health check: run a trivial query to confirm the DB is reachable.
export async function checkDatabaseConnection() {
    const client = await pool.connect();
    try {
        await client.query("SELECT 1");
        return true;
    } finally {
        client.release();
    }
}
