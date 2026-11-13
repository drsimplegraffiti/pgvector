#### Create the project
```
npm init -y
npm install express pg dotenv @huggingface/transformers
mkdir src sql
```
### start Postgres with pgvector
```bash
docker compose down -v && docker compose up -d
```

### start server
```bash
npm start
```

### Troubleshooting
expected 384 dimensions error: the table dimension doesn’t match the model. If
you change models, update VECTOR(384) and re-embed everything.

Port 5432 already in use: change the left side of the port mapping to "5433:5432" and update
DATABASE_URL to use 5433. 

init.sql didn’t run: it only runs the first time. To
reset: docker compose down -v && docker compose up -d.
