require("dotenv").config();

const driver = process.env.DB_DRIVER || "sqlite";

const repository =
    driver === "postgres"
        ? require("./postgresTaskRepository")
        : require("./sqliteTaskRepository");

module.exports = repository;