require("dotenv").config();
const { normalize } = require("./src/llm/normalize");

async function main() {
    const inputs = ["Sr. SWE II", "growth hacker ninja rockstar", "UX/UI Designer"];

    for (const input of inputs) {
        try {
            const result = await normalize(input);
            console.log(input, "->", JSON.stringify(result));
        } catch (err) {
            console.log(input, "-> ERROR:", err.message);
        }
    }
}

main();