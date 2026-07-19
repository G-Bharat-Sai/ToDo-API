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

The AI correctly implemented all five CRUD endpoints exactly as specified, with matching status codes (200, 201, 400, 404) and correct in-memory storage. Validation logic for empty/missing titles worked identically to my own implementation. I understand its code well enough to explain every line — it follows the same lookup → validate → act → respond pattern I used.

### What it got wrong or silently decided

I tested all five endpoint types against the AI's version (GET /tasks, GET /tasks/:id, POST /tasks, PUT /tasks/:id, DELETE /tasks/:id) and it matched my own API's behavior in every case — correct status codes (200, 201, 400, 204) and correct JSON bodies.

- **No `GET /` or `GET /health` routes.** `curl -i http://localhost:3000/` returns Express's default `404 Cannot GET /` instead of a JSON API description. Not a mistake by the AI — my prompt never mentioned these endpoints, so it had no basis to build them.
- **Id generation strategy differs.** My prompt said "generates the next free ID" without specifying *how*. The AI used a separate incrementing counter (`let nextId = 4`), while I calculate it from the array itself (`Math.max(...tasks.map(t => t.id)) + 1`). Both worked for the tests I ran, but a counter can drift out of sync with the actual data over time; deriving from the array cannot.
- **Delete implementation differs.** The AI used `tasks.splice(index, 1)`, I used `tasks.filter(t => t.id !== id)` — different technique, identical observable result (confirmed: both return 204 with an empty body).

### What my prompt forgot to specify

- The `GET /` and `/health` endpoints entirely — a real gap, not a stylistic choice.
- Exactly how "next free ID" should be calculated — the AI made its own reasonable choice (a counter) rather than deriving it from the data.
- Whether Swagger's spec should live in a separate `openapi.json` file or be defined inline — the AI chose to inline it directly in `server.js`; I kept it in a separate file.
- Exact wording for error messages — mine says `"title is required"`, the AI's says `"Title is required and cannot be empty"`. Functionally identical, but a stricter prompt would have specified exact text if that mattered.

### One rematch

I rewrote the prompt to explicitly specify the `GET /` and `GET /health` endpoints (with their exact response bodies) and to require the id-generation logic to derive from the existing array rather than use a separate counter. Both gaps were a direct result of my original prompt's omissions, not AI error — a more complete specification should produce a more complete API, confirming the assignment's core lesson: an AI's output is exactly as good as your spec.