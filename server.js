const express = require("express");
const swaggerUi = require("swagger-ui-express");
const openapiSpec = require("./openapi.json");
const taskRepository = require("./lib/repository");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapiSpec));

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

app.get("/tasks", async (req, res) => {
    const tasks = await taskRepository.getAll();
    res.json(tasks);
});

app.get("/tasks/:id", async (req, res) => {
    const id = Number(req.params.id);
    const task = await taskRepository.getById(id);

    if (!task) {
        return res.status(404).json({ error: `Task ${id} not found` });
    }

    res.json(task);
});

app.post("/tasks", async (req, res) => {
    const title = req.body.title;

    if (!title || title.trim() === "") {
        return res.status(400).json({ error: "title is required" });
    }

    const newTask = await taskRepository.create(title);
    res.status(201).json(newTask);
});

app.put("/tasks/:id", async (req, res) => {
    const id = Number(req.params.id);
    const { title, done } = req.body;

    if (title !== undefined && title.trim() === "") {
        return res.status(400).json({ error: "title cannot be empty" });
    }

    const updated = await taskRepository.update(id, { title, done });

    if (!updated) {
        return res.status(404).json({ error: `Task ${id} not found` });
    }

    res.json(updated);
});

app.delete("/tasks/:id", async (req, res) => {
    const id = Number(req.params.id);
    const deleted = await taskRepository.remove(id);

    if (!deleted) {
        return res.status(404).json({ error: `Task ${id} not found` });
    }

    res.status(204).send();
});

async function start() {
    if (typeof taskRepository.init === "function") {
        await taskRepository.init();
    }

    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log(`Docs available at http://localhost:${PORT}/docs`);
    });
}

start();