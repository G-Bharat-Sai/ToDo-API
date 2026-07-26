const express = require("express");
const swaggerUi = require("swagger-ui-express");
const openapiSpec = require("./openapi.json");
const { DatabaseSync } = require("node:sqlite");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapiSpec));

const db = new DatabaseSync("tasks.db");

db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
        id    INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        done  INTEGER NOT NULL DEFAULT 0
    )
`);

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

function toApiTask(row) {
    return { id: row.id, title: row.title, done: Boolean(row.done) };
}

app.get("/", (req, res) => {
    res.json({
        name: "Task API",
        version: "1.0",
        endpoints: ["/tasks"]
    });
});

app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});

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

app.delete("/tasks/:id", (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);

    if (!existing) {
        return res.status(404).json({ error: `Task ${id} not found` });
    }

    db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
    res.status(204).send();
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Docs available at http://localhost:${PORT}/docs`);
});