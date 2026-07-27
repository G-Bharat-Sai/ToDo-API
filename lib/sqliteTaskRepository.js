const { DatabaseSync } = require("node:sqlite");

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

function getAll() {
    const rows = db.prepare("SELECT * FROM tasks").all();
    return rows.map(toApiTask);
}

function getById(id) {
    const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
    return task ? toApiTask(task) : null;
}

function create(title) {
    const result = db
        .prepare("INSERT INTO tasks (title, done) VALUES (?, ?)")
        .run(title, 0);

    const newTask = db
        .prepare("SELECT * FROM tasks WHERE id = ?")
        .get(result.lastInsertRowid);

    return toApiTask(newTask);
}

function update(id, { title, done }) {
    const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
    if (!existing) return null;

    const newTitle = title !== undefined ? title : existing.title;
    const newDone = done !== undefined ? (done ? 1 : 0) : existing.done;

    db.prepare("UPDATE tasks SET title = ?, done = ? WHERE id = ?").run(
        newTitle,
        newDone,
        id
    );

    const updated = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
    return toApiTask(updated);
}

function remove(id) {
    const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
    if (!existing) return false;

    db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
    return true;
}

module.exports = { getAll, getById, create, update, remove };