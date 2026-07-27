const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function init() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS tasks (
            id    SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            done  BOOLEAN NOT NULL DEFAULT false
        )
    `);

    const { rows } = await pool.query("SELECT COUNT(*) AS count FROM tasks");

    if (Number(rows[0].count) === 0) {
        await pool.query(
            `INSERT INTO tasks (title, done) VALUES
                ('Buy milk', false),
                ('Walk the dog', true),
                ('Write code', false)`
        );
    }
}


async function getAll() {
    const { rows } = await pool.query("SELECT * FROM tasks ORDER BY id");
    return rows;
}

async function getById(id) {
    const { rows } = await pool.query(
        "SELECT * FROM tasks WHERE id = $1",
        [id]
    );
    return rows[0] || null;
}

async function create(title) {
    const { rows } = await pool.query(
        "INSERT INTO tasks (title, done) VALUES ($1, $2) RETURNING *",
        [title, false]
    );
    return rows[0];
}

async function update(id, { title, done }) {
    const existing = await getById(id);
    if (!existing) return null;

    const newTitle = title !== undefined ? title : existing.title;
    const newDone = done !== undefined ? done : existing.done;

    const { rows } = await pool.query(
        "UPDATE tasks SET title = $1, done = $2 WHERE id = $3 RETURNING *",
        [newTitle, newDone, id]
    );
    return rows[0];
}

async function remove(id) {
    const { rowCount } = await pool.query(
        "DELETE FROM tasks WHERE id = $1",
        [id]
    );
    return rowCount > 0;
}

module.exports = { init, getAll, getById, create, update, remove };