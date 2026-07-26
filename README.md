# Task API

A small CRUD API for managing a to-do list, built with **Node.js** and **Express**. Data now lives in a **SQLite database** (`tasks.db`) instead of a JavaScript array — a single file on disk that's created automatically the first time the server runs, and survives a restart.

> This started as an in-memory API in Assignment 1. This is the Assignment 2 update: same endpoints, same request/response shapes, but the storage underneath moved from an array in memory to a real database file.

## What this project does

Full CRUD (Create, Read, Update, Delete) on a list of tasks. Each task has:

- `id` (number) — assigned automatically by SQLite, not by me
- `title` (string) — required, can't be empty
- `done` (boolean) — defaults to `false` on create; stored as `0`/`1` in the actual database since SQLite doesn't have a real boolean type, and converted back to `true`/`false` before it ever reaches the client

## Tech stack

- **Node.js** — needs to be 22.13+ or 23.4+, explained below
- **Express** — same as A1, handles routing and requests
- **node:sqlite** — Node's own built-in SQLite module. No npm package for the database at all.
- **swagger-ui-express** — interactive docs at `/docs`, unchanged from A1

## Why SQLite (and why `node:sqlite` specifically)

The assignment wanted SQLite because it's a single file, needs no server process, and gets the persistence problem solved with basically zero setup. That part was straightforward to agree with.

What wasn't straightforward: I originally tried the `better-sqlite3` npm package, which is what most tutorials use. `npm install better-sqlite3` failed on my machine because it's a native module — it compiles C++ code during install via `node-gyp`, and that needs Visual Studio's C++ build tools installed, which I didn't have (and didn't want to install a multi-GB toolchain just to get a database working).

The fix was switching to `node:sqlite`, which is a SQLite module built directly into Node.js itself. Since I'm running Node 24, it's available with no install step at all — no npm package, no compiler, nothing. The tradeoff is it's still officially labeled "experimental" in Node's docs (though it no longer needs the `--experimental-sqlite` flag as of Node 22.13/23.4+), and you'll see a one-time warning printed on startup that's safe to ignore. For a project this size, built-in and zero-install won out over using the more "standard" third-party package.

If this ever needed to handle multiple servers writing at once, I'd swap to Postgres — SQLite's one-file model isn't built for that kind of concurrency. Not a concern here.

## How to run it

You need **Node.js 22.13+ or 23.4+** for `node:sqlite` to work without extra flags. Check with:
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
This only installs Express and Swagger UI — there's nothing to install for the database, since `node:sqlite` ships with Node.

3. Start the server:
```powershell
node server.js
```

4. API's running at `http://localhost:3000`. Docs at `http://localhost:3000/docs`.

`tasks.db` gets created automatically the first time you run this, with the table and three example tasks already seeded. It's in `.gitignore`, so it never gets committed — every fresh clone starts from the same clean state instead of inheriting whatever was in my local file.

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

Still all in `server.js`, same as A1:

1. **Setup** — Express, Swagger UI, and now `node:sqlite`.
2. **Database bootstrap** — opens `tasks.db`, creates the `tasks` table if it's missing, seeds 3 example rows but only if the table's empty.
3. **Routes** — same lookup → validate → act → respond pattern as A1. The "act" part now runs SQL against `tasks.db` instead of touching an array.
4. **Swagger UI** — unchanged.
5. **Server start** — unchanged.

## Full code walkthrough

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

`new DatabaseSync("tasks.db")` opens the file, creating it if it's not there yet — this is the entire "create your database" step from Stage 0, one line.

`CREATE TABLE IF NOT EXISTS` means this line is safe to run every single time the app starts. First run it actually builds the table. Every run after, it's a no-op because the table already exists — without `IF NOT EXISTS` the server would crash on every restart after the first.

`id INTEGER PRIMARY KEY AUTOINCREMENT` is the biggest change from A1. In A1 I calculated the next id myself with `Math.max(...tasks.map(t => t.id)) + 1`. Now SQLite does that — every insert gets a new, unique, ever-increasing id automatically. I don't touch id logic anywhere in this file anymore.

`done` is `INTEGER` not `BOOLEAN` because SQLite doesn't have a real boolean column type — it's a long-standing SQLite quirk. So `done` lives as `0`/`1` in the actual table, and I convert it to a real JS `true`/`false` right before sending anything back to the client (see the `toApiTask` helper below). I thought about converting it in every route individually but decided one helper function was less error-prone than repeating that logic five times.

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

This is the part I got wrong on my first attempt, actually — I initially just inserted the 3 tasks with no check, and restarting the server kept adding 3 more every time (3, then 6, then 9). The count check fixes that: only seed if the table has 0 rows, meaning this only ever fires successfully once, on the very first run.

The `BEGIN`/`COMMIT`/`ROLLBACK` wrapping is a transaction. If something failed halfway through inserting the 3 rows (crash, whatever), the `catch` rolls it back completely rather than leaving 1 or 2 rows sitting there — which would be worse than either 0 or 3, because then the `count === 0` check would never be true again and I'd be stuck with a permanently incomplete seed. I'd have used `better-sqlite3`'s `db.transaction(fn)` helper if I'd stuck with that package, but `node:sqlite` doesn't have that convenience method yet, so I wrote the transaction by hand instead. Same protection either way.

### 3. Reading tasks

```javascript
app.get("/tasks", (req, res) => {
    const rows = db.prepare("SELECT * FROM tasks").all();
    res.json(rows.map(toApiTask));
});

app.get("/tasks/:id", (req, res) => {
    const id = Number(req.params.id);
    const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);

    if (!task) {
        return res.status(404).json({ error: `Task ${id} not found` });
    }

    res.json(toApiTask(task));
});
```

`.all()` gets every row back as an array. `.get()` gets one row, or `undefined` if nothing matched — which is why `if (!task)` still works exactly like A1's `.find()` returning `undefined`.

The `?` in `WHERE id = ?` is the one thing I made sure to get right everywhere in this file: it's a parameterized placeholder. `id` gets passed in separately through `.get(id)`, never pasted directly into the SQL string. If I'd written `` `WHERE id = ${id}` `` instead, and `id` ever contained something unexpected, it could change what the query actually does — that's SQL injection. Binding it as a parameter means the database always treats it as a plain value, full stop, no matter what's in it.

### 4. Creating a task

```javascript
app.post("/tasks", (req, res) => {
    const title = req.body.title;

    if (!title || title.trim() === "") {
        return res.status(400).json({ error: "title is required" });
    }

    const result = db
        .prepare("INSERT INTO tasks (title, done) VALUES (?, ?)")
        .run(title, 0);

    const newTask = db
        .prepare("SELECT * FROM tasks WHERE id = ?")
        .get(result.lastInsertRowid);

    res.status(201).json(toApiTask(newTask));
});
```

Validation is identical to A1. The new part is `result.lastInsertRowid` — after `.run()` executes the insert, it tells me the id SQLite just assigned. I use that to immediately re-select the row and send back exactly what got stored, id included, same guarantee A1 gave.

### 5. Updating a task

```javascript
app.put("/tasks/:id", (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);

    if (!existing) {
        return res.status(404).json({ error: `Task ${id} not found` });
    }

    const { title, done } = req.body;

    if (title !== undefined && title.trim() === "") {
        return res.status(400).json({ error: "title cannot be empty" });
    }

    const newTitle = title !== undefined ? title : existing.title;
    const newDone = done !== undefined ? (done ? 1 : 0) : existing.done;

    db.prepare("UPDATE tasks SET title = ?, done = ? WHERE id = ?").run(
        newTitle,
        newDone,
        id
    );

    const updated = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
    res.json(toApiTask(updated));
});
```

This one took a bit of thinking to get right. A1's partial update just skipped assigning a property if the client didn't send it (`if (title !== undefined) task.title = title;`). But SQL's `UPDATE ... SET title = ?, done = ?` always needs a value for both columns — you can't leave one out mid-statement the way you can skip a JS assignment. So instead I figure out what each column's value *should be* first: the client's value if they sent one, otherwise whatever the row already had (`existing.title` / `existing.done`). The `UPDATE` always writes both columns, but sometimes it's just writing back the same value — which behaves identically to not touching it.

### 6. Deleting a task

```javascript
app.delete("/tasks/:id", (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);

    if (!existing) {
        return res.status(404).json({ error: `Task ${id} not found` });
    }

    db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
    res.status(204).send();
});
```

Same lookup-then-404 pattern one more time. No more `tasks.filter(...)` reassignment trick from A1 — that was only needed because I was manipulating a JS array. The database just deletes the matching row directly.

## Stage 4 — SQL by hand

Opened `tasks.db` in DB Browser for SQLite and ran a few queries directly against it while the server was still running, to see if the API and DB Browser were really reading the same file live.

```sql
UPDATE tasks SET done = 1;
```
Marked all 3 tasks as done. After clicking **Write Changes** in DB Browser, I hit `GET /tasks` from a separate terminal with no server restart, and all 3 tasks showed `"done": true` immediately.

Also ran:
```sql
DELETE FROM tasks WHERE done = 1;
```
which wiped the table, confirmed via an empty `GET /tasks` response — then manually re-inserted the 3 seed rows through DB Browser to get back to a normal starting state. Worth noting: the re-inserted rows came back with ids `5, 6, 7`, not `1, 2, 3` — `AUTOINCREMENT` remembers the highest id it's ever handed out and never reuses one, even across a full delete.

![tasks.db in DB Browser](db-browser-screenshot.png)

## A note on persistence

This is the actual point of the assignment: restarting the server no longer wipes the task list. `tasks.db` is a real file, so anything created, updated, or deleted through the API sticks around. The 3 example tasks only ever get inserted once — the very first time the app runs against an empty table.

## AI vs me

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
- **Id generation differs.** I said "generates the next free ID" without saying how. It used a separate counter (`let nextId = 4`); I derive mine from the array (`Math.max(...tasks.map(t => t.id)) + 1`). Both worked in my tests, but a counter can drift out of sync with the real data over time — deriving from the data can't.
- **Delete implementation differs.** It used `tasks.splice(index, 1)`, I used `tasks.filter(t => t.id !== id)` — different technique, same result, confirmed both return 204 with an empty body.

### What my prompt forgot to specify

- `GET /` and `/health` entirely — a real gap in my spec, not a stylistic choice.
- Exactly how "next free ID" should work — the AI made its own reasonable call.
- Whether the Swagger spec should be a separate file or inline — it inlined it, I kept mine separate.
- Exact error message wording — mine says `"title is required"`, its says `"Title is required and cannot be empty"`. Same meaning, different text; I'd have needed to specify exact wording if that mattered to me.

### One rematch

Rewrote the prompt to explicitly call out `GET /` and `GET /health` with exact response bodies, and to require deriving the id from the array instead of using a counter. Both original gaps were my prompt's fault, not the AI's — confirms the whole point of this exercise: an AI's output is only as good as what you actually tell it.

### Stage 6 — SQLite migration rematch (A2)

_(To be added once I run Stage 6: writing my own migration prompt from memory, generating it into an `ai-version/` folder, and diffing it against this hand-built version.)_

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