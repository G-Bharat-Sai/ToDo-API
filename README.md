# Task API

A small CRUD API for managing a to-do list, built with **Node.js** and **Express**. Data now lives in a **SQLite database** (`tasks.db`) instead of a JavaScript array — a single file on disk that's created automatically the first time the server runs, and survives a restart.

> This started as an in-memory API in Assignment 1. Assignment 2 moved storage to SQLite. Assignment 3 (BE-04) moves it again, to Postgres running in Docker — see that section near the bottom.

## What this project does

Full CRUD (Create, Read, Update, Delete) on a list of tasks. Each task has:

- `id` (number) — assigned automatically by the database, not by the app
- `title` (string) — required, can't be empty
- `done` (boolean) — defaults to `false` on create

## Tech stack

- **Node.js** — needs to be 22.13+ or 23.4+ (for `node:sqlite`)
- **Express** — handles routing and requests
- **node:sqlite** — Node's own built-in SQLite module, used in local/SQLite mode
- **pg** — Postgres driver, used when running against Docker/Postgres (see BE-04 section)
- **Docker + Docker Compose** — runs Postgres, and optionally the app itself, in containers
- **swagger-ui-express** — interactive docs at `/docs`

## Why SQLite (and why `node:sqlite` specifically)

The A2 assignment wanted SQLite because it's a single file, needs no server process, and gets the persistence problem solved with basically zero setup.

I originally tried the `better-sqlite3` npm package, which is what most tutorials use. `npm install better-sqlite3` failed on my machine because it's a native module — it compiles C++ code during install via `node-gyp`, and that needs Visual Studio's C++ build tools installed, which I didn't have.

The fix was switching to `node:sqlite`, a SQLite module built directly into Node.js itself. Since I'm running Node 24, it's available with no install step at all — no npm package, no compiler. It's still labeled "experimental" in Node's docs (though it no longer needs the `--experimental-sqlite` flag as of Node 22.13/23.4+), and prints a one-time harmless warning on startup.

## How to run it (SQLite mode)

You need **Node.js 22.13+ or 23.4+**. Check with:
```powershell
node --version
```

1. Clone the repo:
```powershell
git clone https://github.com/G-Bharat-Sai/ToDo-API.git
cd ToDo-API
```

2. Install dependencies:
```powershell
npm install
```

3. Set `DB_DRIVER=sqlite` in `.env` (or leave `.env` unset — SQLite is the default), then start the server:
```powershell
node server.js
```

4. API's running at `http://localhost:3000`. Docs at `http://localhost:3000/docs`.

`tasks.db` gets created automatically the first time you run this, with the table and three example tasks already seeded. It's in `.gitignore`, so it never gets committed.

**For running against Postgres in Docker instead, see the BE-04 section near the bottom of this README.**

## Endpoints

| Method | Path | Description | Success | Errors |
|---|---|---|---|---|
| GET | `/` | API info | 200 | — |
| GET | `/health` | Health check | 200 | — |
| GET | `/tasks` | All tasks | 200 | — |
| GET | `/tasks/:id` | One task | 200 | 404 if id doesn't exist |
| POST | `/tasks` | Create a task. Body: `{ "title": "string" }` | 201 | 400 if title missing/empty |
| PUT | `/tasks/:id` | Update `title` and/or `done`. Body: `{ "title"?: "string", "done"?: boolean }` | 200 | 400 if title empty, 404 if id doesn't exist |
| DELETE | `/tasks/:id` | Delete a task | 204 (no body) | 404 if id doesn't exist |

## How the code is organized

- `server.js` — Express app and routes. Talks only to `lib/repository.js`, never to a database directly (see BE-04 section for why).
- `lib/repository.js` — picks which database implementation to load, based on the `DB_DRIVER` environment variable.
- `lib/sqliteTaskRepository.js` — SQLite implementation (A2).
- `lib/postgresTaskRepository.js` — Postgres implementation (BE-04).
- `openapi.json` — Swagger spec served at `/docs`.

## Full code walkthrough (SQLite repository)

### 1. Opening the database and creating the table

```javascript
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("tasks.db");

db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
        id    INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        done  INTEGER NOT NULL DEFAULT 0
    )
`);
```

`node:sqlite` is built into Node itself — `require("node:sqlite")` needs no npm install and no native compilation.

`new DatabaseSync("tasks.db")` opens the file, creating it if it's not there yet.

`CREATE TABLE IF NOT EXISTS` is safe to run every startup: builds the table the first time, harmless no-op every time after.

`id INTEGER PRIMARY KEY AUTOINCREMENT` means SQLite assigns ids itself — no more manual `Math.max(...) + 1` id bookkeeping like the original A1 in-memory version needed.

`done` is `INTEGER` not `BOOLEAN` because SQLite has no native boolean column type — it's stored as `0`/`1` and converted to real JS `true`/`false` on the way out (see `toApiTask` below).

### 2. Seeding, but only once

```javascript
const row = db.prepare("SELECT COUNT(*) AS count FROM tasks").get();

if (row.count === 0) {
    const seedTasks = [
        { title: "Buy milk", done: false },
        { title: "Walk the dog", done: true },
        { title: "Write code", done: false }
    ];

    const insert = db.prepare("INSERT INTO tasks (title, done) VALUES (?, ?)");

    db.exec("BEGIN");
    try {
        for (const t of seedTasks) {
            insert.run(t.title, t.done ? 1 : 0);
        }
        db.exec("COMMIT");
    } catch (err) {
        db.exec("ROLLBACK");
        throw err;
    }
}
```

The row count is checked *before* inserting anything — without this, every restart would add 3 more tasks (3, then 6, then 9). The `BEGIN`/`COMMIT`/`ROLLBACK` wrapping makes the three inserts all-or-nothing: if something failed partway through, the `catch` rolls back rather than leaving a partially-seeded table.

### 3. Reading, creating, updating, deleting

Every query uses a `?` parameterized placeholder, with the actual value passed separately (e.g. `.get(id)`), never glued into the SQL string. Pasting a value directly into SQL text (e.g. `` `WHERE id = ${id}` ``) risks SQL injection if that value ever contains something unexpected; binding it as a parameter means the database always treats it as a plain value, never as SQL syntax.

`PUT` does a partial update: since SQL's `UPDATE ... SET title = ?, done = ?` always needs a value for both columns (unlike JS, where you can just skip a property assignment), the code computes each column's new value first — the client's value if they sent one, otherwise the row's existing value — so unsent fields are effectively left untouched.

## Stage 4 — SQL by hand

Opened `tasks.db` in DB Browser for SQLite and ran queries directly against it while the server was running, to confirm the API and DB Browser read the exact same file live, with no restart needed.

```sql
UPDATE tasks SET done = 1;
```
Marked all 3 tasks as done. After clicking **Write Changes** in DB Browser, `GET /tasks` immediately showed `"done": true` on all three, with no server restart.

Also ran `DELETE FROM tasks WHERE done = 1;`, confirmed via an empty `GET /tasks`, then manually re-inserted the 3 seed rows through DB Browser. Worth noting: the re-inserted rows came back with new, higher ids — `AUTOINCREMENT` never reuses an id, even after a full delete.

![tasks.db in DB Browser](db-browser-screenshot.png)

## A note on persistence (SQLite)

Restarting the server no longer wipes the task list — `tasks.db` is a real file, so anything created, updated, or deleted through the API sticks around. The 3 example tasks only ever get inserted once, the very first time the app runs against an empty table.

## AI vs me (Assignment 1)

### My prompt

> Build a REST API for a to-do list using Node.js with Express.
>
> Endpoints:
> - GET /tasks → Returns the entire list of tasks with a 200 OK status code.
> - GET /tasks/:id → Returns a single task by its ID. If not found, returns 404 with a JSON error message.
> - POST /tasks → Accepts a JSON body with a title. Generates the next free ID, sets done to false, adds it to the list, returns the created task with 201 Created.
> - PUT /tasks/:id → Replaces a task's title and/or done status. Returns 200 OK, or 404 if the ID doesn't exist.
> - DELETE /tasks/:id → Removes the task, returns 204 No Content, or 404 if the ID doesn't exist.
>
> Validation: For POST and PUT, if title is missing or empty, return 400 Bad Request with a JSON error message.
>
> Data storage: In-memory list with 3 pre-filled example tasks. Each task has id (number), title (text), done (boolean).
>
> Also add: Swagger UI at /docs.

### What the AI did well

Got all five CRUD endpoints right, matching status codes (200, 201, 400, 404), matching in-memory storage. Validation for empty/missing titles worked the same as mine. I could explain every line it wrote — same lookup → validate → act → respond shape I used myself.

### What it got wrong or silently decided

Tested all five endpoints against the AI's version and it matched my behavior every time — right status codes (200, 201, 400, 204), right JSON bodies.

- **No `GET /` or `GET /health`.** `curl -i http://localhost:3000/` gave Express's default `404 Cannot GET /` instead of a JSON description. Not the AI's fault — I never mentioned these routes in the prompt.
- **Id generation differs.** I said "generates the next free ID" without saying how. It used a separate counter (`let nextId = 4`); I derive mine from the array (`Math.max(...tasks.map(t => t.id)) + 1`). Both worked in my tests, but a counter can drift out of sync with the real data over time.
- **Delete implementation differs.** It used `tasks.splice(index, 1)`, I used `tasks.filter(t => t.id !== id)` — different technique, same result.

### What my prompt forgot to specify

- `GET /` and `/health` entirely — a real gap in my spec.
- Exactly how "next free ID" should work.
- Whether the Swagger spec should be a separate file or inline.
- Exact error message wording.

### One rematch

Rewrote the prompt to explicitly call out `GET /` and `GET /health` with exact response bodies, and to require deriving the id from the array instead of using a counter. Both original gaps were my prompt's fault, not the AI's — confirms the whole point of this exercise: an AI's output is only as good as what you actually tell it.

## Example request

```powershell
curl.exe -i http://localhost:3000/tasks/1
```

```
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
{"id":1,"title":"Buy milk","done":false}

```
## Swagger UI

All endpoints, viewable and testable at `http://localhost:3000/docs`:

![Swagger UI screenshot](swagger-screenshot.png)

---

# Assignment 3 (BE-04) — Postgres in Docker

This update moves storage again — from SQLite (A2) to **Postgres running in Docker** — while proving the same architectural point A2 already set up: swapping the database is a config change, not a code change.

## What changed

- **A repository layer was introduced.** Before this, `server.js` talked to SQLite directly. Now all database logic lives behind a small interface — `getAll()`, `getById(id)`, `create(title)`, `update(id, fields)`, `remove(id)` — implemented twice: once for SQLite (`lib/sqliteTaskRepository.js`, unchanged from A2 except a rename), once for Postgres (`lib/postgresTaskRepository.js`, new). `lib/repository.js` picks which one to load based on the `DB_DRIVER` environment variable. `server.js` only ever calls `taskRepository.something()` — it has no idea which database is actually behind it.
- **Postgres runs in Docker**, not installed locally. `docker-compose.yml` defines a `db` service using the official `postgres:16` image, with a named volume (`pgdata`) so data survives the container being destroyed and recreated.
- **The app itself is also containerized.** A `Dockerfile` builds the Node app into an image; `docker-compose.yml`'s `app` service runs it alongside `db`. `docker compose up` starts both together with one command.
- **Config moved to `.env`.** `DATABASE_URL` and `DB_DRIVER` are read from environment variables via the `dotenv` package, never hardcoded. `.env` holds the real values and is gitignored; `.env.example` is committed and documents the shape without any real secrets in it.

## Why Postgres + Docker (vs. sticking with SQLite)

SQLite was fine for A2 — single file, zero setup, genuinely good for a small local project. Postgres is the next step up: a real client-server database that supports concurrent connections properly, which matters once more than one thing might be reading/writing at once. Running it in Docker instead of installing Postgres directly on Windows means the exact same environment works on any machine — no "works on my machine" version mismatches, and no manual Postgres install/uninstall to manage.

## Why a repository layer

A2 already achieved "swap SQLite for Postgres without touching routes" in principle, but the SQL was still written directly inside `server.js`. Pulling it out into `lib/sqliteTaskRepository.js` and `lib/postgresTaskRepository.js` — both exporting the identical five function names — makes the swap literal: `lib/repository.js` is the *only* file that decides which implementation loads, based on one environment variable (`DB_DRIVER`). `server.js` was already correct before this change and needed zero edits to its route logic to support Postgres — only `await` was added in front of repository calls, since Postgres queries are asynchronous (real network calls) where SQLite's were synchronous (local file reads).

## `.env` setup

Copy the example file and it works as-is against the Docker Postgres setup below:
```powershell
copy .env.example .env
```

Contents of `.env.example` (safe to view — no real secrets, just documents what's needed):

```
DATABASE_URL=postgresql://taskapi:taskapi_dev_password@localhost:5432/tasks
DB_DRIVER=postgres
```
- `DATABASE_URL` — the Postgres connection string: `postgresql://user:password@host:port/database`. When running the app directly on your machine against the Dockerized database, `host` is `localhost` because Docker publishes Postgres's port out to the host machine. Inside `docker-compose.yml`, the `app` service overrides this to `db:5432` instead — `db` is the *service name* Docker Compose gives that container on its internal network, and `localhost` from inside a container means "inside that container," not the host machine or the other container. That's the one genuinely non-obvious Docker networking detail in this whole setup.
- `DB_DRIVER` — `postgres` or `sqlite` (or unset, which defaults to `sqlite`). This is the single switch `lib/repository.js` reads to decide which repository implementation to load.

## How to run it

```powershell
docker compose up -d
```

This builds the app image, starts Postgres, waits for Postgres to report healthy (via a `pg_isready` healthcheck) before starting the app, and creates the `tasks` table + seeds 3 example tasks on first run. API available at `http://localhost:3000`, docs at `http://localhost:3000/docs`.

To stop everything:
```powershell
docker compose down
```
This removes the containers but **not** the volume — `pgdata` and everything in it survives. To wipe the database completely (rare, intentional-only): `docker compose down -v`.

## How persistence was proven

Created a task through the running API, then tore down the *entire* stack — not paused, fully removed:
```powershell
docker compose down
docker compose ps   # confirmed empty — both containers genuinely gone
docker compose up -d
```
After the stack came back up (brand new containers, confirmed via fresh "Created" timestamps in `docker compose ps`), `GET /tasks` still showed the task created before the teardown. Since the containers were verifiably destroyed and recreated, the only thing that could have carried the data across is the named volume (`pgdata`) — proving the volume, not the container, is what actually persists the data. Ran this same before/after check against `psql` directly (`docker compose exec db psql -U taskapi -d tasks -c "SELECT * FROM tasks;"`) as a second, independent confirmation that the API wasn't just returning cached data.

## Architecture

Client
→ API (Express, server.js)
→ taskRepository (lib/repository.js — picks implementation via DB_DRIVER)
→ sqliteTaskRepository → tasks.db
→ postgresTaskRepository → Postgres (Docker container, pgdata volume)
Routes and validation logic in `server.js` are byte-for-byte the same regardless of which branch of that diagram is active — the only thing that changes between SQLite and Postgres mode is one environment variable.
