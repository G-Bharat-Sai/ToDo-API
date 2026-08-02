const express = require("express");
const swaggerUi = require("swagger-ui-express");
const openapiSpec = require("./openapi.json");
const taskRepository = require("./lib/repository");
require("dotenv").config();
const supabase = require("./lib/supabaseClient");

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

// ----------------------------------------------------------------------
// Stage 2 — public gate
// ----------------------------------------------------------------------

app.get("/public/info", (req, res) => {
    res.json({ message: "Welcome stranger! This info is public." });
});

// ----------------------------------------------------------------------
// Stage 1 — Sign Up & Log In
// ----------------------------------------------------------------------

app.post("/auth/signup", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "email and password are required" });
    }

    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
        return res.status(400).json({ error: error.message });
    }

    res.status(201).json(data.user);
});

app.post("/auth/login", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "email and password are required" });
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
        return res.status(401).json({ error: "Invalid login credentials" });
    }

    res.status(200).json({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token
    });
});


app.get("/protected/profile", (req, res) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Access token required" });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({ error: "Access token required" });
    }

   
    res.json({ message: "Token present (not yet verified)" });
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

    const { error } = await supabase.auth.getSession();
    if (error) {
        console.error("Failed to connect to Supabase:", error.message);
        process.exit(1);
    }

    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log(`Connected to Supabase`);
        console.log(`Docs available at http://localhost:${PORT}/docs`);
    });
}

start();