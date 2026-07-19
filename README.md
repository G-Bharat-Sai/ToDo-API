# Task API

A small CRUD API for managing a to-do list, built with **Node.js** and **Express**. Data is stored **in memory** (a plain JavaScript array) — there is no database yet, so all tasks are lost when the server restarts. This is intentional for this stage of the project.

## What this project does

The API supports full CRUD (Create, Read, Update, Delete) on a list of tasks. Each task has:

- `id` (number) — assigned automatically by the server
- `title` (string) — required, cannot be empty
- `done` (boolean) — defaults to `false` when a task is created

## Tech stack

- **Node.js** — JavaScript runtime that runs the server
- **Express** — web framework handling routing, requests, and responses
- **swagger-ui-express** — serves interactive API documentation at `/docs`

## How to run it

1. Clone this repository:
```powershell
   git clone https://github.com/G-Bharat-Sai/ToDo-API.git
   cd ToDo-API
```

2. Install dependencies:
```powershell
   npm install
```

3. Start the server:
```powershell
   node server.js
```

4. The API is now running at `http://localhost:3000`. Interactive docs are at `http://localhost:3000/docs`.

## Endpoints

| Method | Path | Description | Success | Errors |
|---|---|---|---|---|
| GET | `/` | Describes the API (name, version, endpoints) | 200 | — |
| GET | `/health` | Health check — confirms the server is running | 200 | — |
| GET | `/tasks` | Returns the full list of tasks | 200 | — |
| GET | `/tasks/:id` | Returns a single task by id | 200 | 404 if id doesn't exist |
| POST | `/tasks` | Creates a new task. Body: `{ "title": "string" }` | 201 | 400 if title is missing/empty |
| PUT | `/tasks/:id` | Updates a task's `title` and/or `done`. Body: `{ "title"?: "string", "done"?: boolean }` | 200 | 400 if title is empty, 404 if id doesn't exist |
| DELETE | `/tasks/:id` | Deletes a task by id | 204 (no body) | 404 if id doesn't exist |

## How the code is organized

Everything lives in `server.js` — small enough for this stage of the project not to need multiple files. Reading top to bottom:

1. **Setup** — imports Express and `swagger-ui-express`, creates the `app`, and registers `express.json()` middleware so incoming JSON request bodies are automatically parsed into `req.body`.
2. **Data** — a single in-memory array, `tasks`, pre-filled with 3 example tasks. This is the "database" for now.
3. **Routes** — one block per endpoint, each following the same shape:
   - Read the request (`req.params.id` for the URL's id, `req.body` for POST/PUT data)
   - Validate anything the client sent, returning `400` with a JSON error if it's invalid
   - Look up the task, returning `404` with a JSON error if it doesn't exist
   - Perform the actual work (read/create/update/delete)
   - Send back the right status code and body
4. **Swagger UI** — `openapi.json` describes every endpoint (paths, methods, expected bodies, possible responses). `swagger-ui-express` reads that file and serves an interactive page at `/docs` where each endpoint can be tested with a "Try it out" button.
5. **Server start** — `app.listen(PORT, ...)` starts the server listening on port 3000.

## Full code walkthrough

### 1. Setup and middleware

```javascript
const express = require("express");
const swaggerUi = require("swagger-ui-express");
const openapiSpec = require("./openapi.json");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapiSpec));
```

- `require(...)` loads Express and the Swagger UI package, plus the `openapi.json` spec file (Node can `require` JSON files directly).
- `express()` creates the app — the object every route and middleware attaches to.
- `app.use(express.json())` registers **middleware** that runs on every incoming request, parsing JSON request bodies so they're available as `req.body`. Without this line, `POST`/`PUT` routes couldn't read what the client sent.
- `app.use("/docs", ...)` mounts the interactive Swagger UI page at `/docs`, built from `openapi.json`.

### 2. In-memory data

```javascript
let tasks = [
    { id: 1, title: "Buy milk", done: false },
    { id: 2, title: "Walk the dog", done: true },
    { id: 3, title: "Write code", done: false }
];
```

This array *is* the database for now — a plain JavaScript array of objects, living only in the server's memory. `let` (not `const`) is used because the array gets reassigned entirely during delete operations (see below).

### 3. GET / and GET /health

```javascript
app.get("/", (req, res) => {
    res.json({ name: "Task API", version: "1.0", endpoints: ["/tasks"] });
});

app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});
```

Two simple routes with no input — they just describe the API and confirm the server is alive. `res.json(...)` converts a JavaScript object into a JSON response and sets the `Content-Type` header automatically.

### 4. GET /tasks and GET /tasks/:id

```javascript
app.get("/tasks", (req, res) => {
    res.json(tasks);
});

app.get("/tasks/:id", (req, res) => {
    const id = Number(req.params.id);
    const task = tasks.find(t => t.id === id);

    if (!task) {
        return res.status(404).json({ error: `Task ${id} not found` });
    }

    res.json(task);
});
```

- `GET /tasks` returns the entire array as-is.
- `GET /tasks/:id` reads the `:id` **path parameter** from the URL via `req.params.id` (always a string, so it's converted with `Number(...)` before comparing). `.find()` searches the array for a matching task. If nothing matches, it returns `404` with a JSON error — the API never silently returns an empty success for something that doesn't exist.

### 5. POST /tasks

```javascript
app.post("/tasks", (req, res) => {
    const title = req.body.title;

    if (!title || title.trim() === "") {
        return res.status(400).json({ error: "title is required" });
    }

    const newId = tasks.length > 0 ? Math.max(...tasks.map(t => t.id)) + 1 : 1;

    const newTask = { id: newId, title: title, done: false };

    tasks.push(newTask);
    res.status(201).json(newTask);
});
```

- Reads `title` from the parsed request body.
- Validates it: rejects missing or whitespace-only titles with `400 Bad Request`.
- Calculates the next id as the current highest id + 1 (rather than `tasks.length + 1`), so a deleted task's id is never accidentally reused for a new one.
- Adds the new task to the array and responds with `201 Created` plus the created task, so the client knows exactly what was stored (including its assigned `id`).

### 6. PUT /tasks/:id

```javascript
app.put("/tasks/:id", (req, res) => {
    const id = Number(req.params.id);
    const task = tasks.find(t => t.id === id);

    if (!task) {
        return res.status(404).json({ error: `Task ${id} not found` });
    }

    const { title, done } = req.body;

    if (title !== undefined && title.trim() === "") {
        return res.status(400).json({ error: "title cannot be empty" });
    }

    if (title !== undefined) task.title = title;
    if (done !== undefined) task.done = done;

    res.json(task);
});
```

- Looks up the task the same way as `GET /tasks/:id`; `404` if it doesn't exist.
- Destructures `title` and `done` from the body.
- Update is **partial**: each field is only overwritten if it was actually included in the request. Sending just `{ "done": true }` leaves `title` untouched.
- An explicitly empty `title` is still rejected with `400`, same rule as creation.

### 7. DELETE /tasks/:id

```javascript
app.delete("/tasks/:id", (req, res) => {
    const id = Number(req.params.id);
    const task = tasks.find(t => t.id === id);

    if (!task) {
        return res.status(404).json({ error: `Task ${id} not found` });
    }

    tasks = tasks.filter(t => t.id !== id);
    res.status(204).send();
});
```

- Same lookup-then-404 pattern as the other `:id` routes.
- `tasks.filter(t => t.id !== id)` builds a **new array** excluding the matched task, then reassigns `tasks` to it — this is why `tasks` had to be declared with `let`.
- Responds with `204 No Content` and an empty body — the correct convention for "it worked, there's nothing more to say."

### 8. Starting the server

```javascript
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
```

This is what actually starts the server listening for requests on port 3000. Everything above it just *defines* behavior; nothing runs until a request comes in and matches a route.

### A couple of implementation details worth knowing

- **Task ids** are generated with `Math.max(...tasks.map(t => t.id)) + 1` rather than `tasks.length + 1`. This avoids id collisions after a task has been deleted (using `.length` alone can reassign an id that still belongs to an existing task).
- **PUT updates are partial** — sending just `{ "done": true }` only changes `done`, leaving `title` untouched. Each field is checked individually with `!== undefined` before being applied.
- **DELETE returns 204 with no body** — this is the correct HTTP convention for "the action succeeded, there's nothing more to say."

## Example request

```powershell
curl -i http://localhost:3000/tasks/1
```
```
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
{"id":1,"title":"Buy milk","done":false}

```
## Swagger UI

All endpoints, viewable and testable at `http://localhost:3000/docs`:

![Swagger UI screenshot](swagger-screenshot.png)

## A note on in-memory storage

Restarting the server resets `tasks` back to the original 3 example items — any tasks created, updated, or deleted during a session are lost. This is a deliberate limitation at this stage of the project; persistent storage (a database) is planned for the following stage of the assignment.