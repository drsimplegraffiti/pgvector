#!/bin/bash
#
# Test script for the semantic search server.
# Make sure the server is running: npm start
# Make sure MongoDB is running locally: mongodb://localhost:27017/vectordb01
#
set -e

BASE="http://localhost:3008"

echo "=== 1. Health check ==="
curl -s "$BASE/health" | jq .

echo ""
echo "=== 2. Create products (stored in MongoDB + indexed in pgvector) ==="

curl -s -X POST "$BASE/products" -H "Content-Type: application/json" \
  -d '{"productname":"iPhone 15","sku":"IPH-15-128","qty":24,"description":"Titanium, 128GB, blue","price":999}' | jq .

curl -s -X POST "$BASE/products" -H "Content-Type: application/json" \
  -d '{"productname":"Samsung Galaxy S24","sku":"SAM-S24-256","qty":18,"description":"Android, 256GB, violet","price":899}' | jq .

curl -s -X POST "$BASE/products" -H "Content-Type: application/json" \
  -d '{"productname":"MacBook Pro M3","sku":"MAC-M3-512","qty":12,"description":"Laptop, 512GB, space gray","price":1999}' | jq .

echo ""
echo "=== 3. Semantic search for products ==="

# Search with different words than the stored text:
curl -s "$BASE/search?q=titanium%20phone&limit=5" | jq .

# Another query — should still return the iPhone first:
curl -s "$BASE/search?q=apple%20smartphone&limit=5" | jq .

# Un-related query — laptop should come back:
curl -s "$BASE/search?q=laptop%20computer&limit=5" | jq .

echo ""
echo "=== 4. Raw pgvector document search (text only) ==="
curl -s "$BASE/search?q=credit%20card%20payment&limit=5" | jq .

echo ""
echo "=== What's happening, in one picture ==="
echo "POST /products  ->  product details -> MongoDB (source of truth)"
echo "                  -> concatenated text -> embed() -> pgvector (semantic index)"
echo ""
echo "GET  /search    ->  query -> embed() -> pgvector HNSW index -> mongodb_ids"
echo "                  -> fetch full products from MongoDB -> return with similarity"
