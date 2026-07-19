const express = require("express");
const swaggerUi = require("swagger-ui-express");
const app = express();
const PORT = 3000;

app.use(express.json());

let tasks = [
  { id: 1, title: "Sample task 1", done: false },
  { id: 2, title: "Sample task 2", done: false },
  { id: 3, title: "Sample task 3", done: false }
];

let nextId = 4;

const swaggerDocument = {
  openapi: "3.0.0",
  info: { title: "To-Do API", version: "1.0.0" },
  paths: {
    "/tasks": {
      get: { summary: "Get all tasks", responses: { 200: { description: "OK" } } },
      post: { summary: "Create a task", responses: { 201: { description: "Created" }, 400: { description: "Bad Request" } } }
    },
    "/tasks/{id}": {
      get: { summary: "Get task by ID", responses: { 200: { description: "OK" }, 404: { description: "Not Found" } } },
      put: { summary: "Update task", responses: { 200: { description: "OK" }, 400: { description: "Bad Request" }, 404: { description: "Not Found" } } },
      delete: { summary: "Delete task", responses: { 204: { description: "No Content" }, 404: { description: "Not Found" } } }
    }
  }
};

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.get("/tasks", (req, res) => {
  res.status(200).json(tasks);
});

app.get("/tasks/:id", (req, res) => {
  const task = tasks.find(t => t.id === parseInt(req.params.id));
  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }
  res.status(200).json(task);
});

app.post("/tasks", (req, res) => {
  const { title } = req.body;
  if (!title || title.trim() === "") {
    return res.status(400).json({ error: "Title is required and cannot be empty" });
  }
  const newTask = { id: nextId++, title, done: false };
  tasks.push(newTask);
  res.status(201).json(newTask);
});

app.put("/tasks/:id", (req, res) => {
  const task = tasks.find(t => t.id === parseInt(req.params.id));
  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }
  const { title, done } = req.body;
  if (title !== undefined) {
    if (title.trim() === "") {
      return res.status(400).json({ error: "Title cannot be empty" });
    }
    task.title = title;
  }
  if (done !== undefined) {
    task.done = done;
  }
  res.status(200).json(task);
});

app.delete("/tasks/:id", (req, res) => {
  const index = tasks.findIndex(t => t.id === parseInt(req.params.id));
  if (index === -1) {
    return res.status(404).json({ error: "Task not found" });
  }
  tasks.splice(index, 1);
  res.status(204).send();
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});