```bash
curl -X POST localhost:3000/documents -H "Content-Type: application/json" \
  -d '{"content": "To reset your password, click Forgot Password on the login page."}' | jq .

curl -X POST localhost:3000/documents -H "Content-Type: application/json" \
  -d '{"content": "Our office is open Monday to Friday, 9am to 5pm."}' | jq .

curl -X POST localhost:3000/documents -H "Content-Type: application/json" \
  -d '{"content": "You can pay by credit card, bank transfer, or PayPal."}' | jq
  .

```

Now search with different words than the stored text:
```bash
curl "localhost:3000/search?q=I%20forgot%20my%20login%20credentials" | jq .
```

The password document should come back first with the highest similarity, even though the query shares almost no words with it. That’s semantic search working.

### What’s happening, in one picture
```bash
POST /documents  ->  text -> embed() -> 384 numbers -> INSERT into Postgres
GET  /search     ->  query -> embed() -> 384 numbers -> ORDER BY <=> -> top K rows
```

Further test:
```bash
curl "localhost:3000/search?q=When%20can%20I%20visit%20the%20office" | jq .
```

## To load file
```bash
curl -F "file=@notes.txt" localhost:3000/upload
# {"source":"notes.txt","chunks":1}
```

That file is short, so it becomes 1 chunk. To see chunking properly, upload any
longer text file (an article or a README) and watch the chunk count go up.
Search it:
```bash
curl "localhost:3000/search?q=how%20long%20do%20I%20wait%20for%20my%20money%20back"
```
