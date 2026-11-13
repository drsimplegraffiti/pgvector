import pg from "pg";
import "dotenv/config";

// A pool keeps several connections open and reuses them,
// which is faster than connecting on every request.
export const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
});
