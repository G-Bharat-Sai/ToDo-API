const fs = require("fs");
const path = require("path");

const CASES_PATH = path.join(__dirname, "cases.json");
const cases = JSON.parse(fs.readFileSync(CASES_PATH, "utf-8"));

const ENDPOINT = "http://localhost:3000/normalize";

async function runEval() {
    let passed = 0;
    const failures = [];

    for (const testCase of cases) {
        const response = await fetch(ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: testCase.input })
        });

        const body = await response.json();
        const actual = body.canonical_title;
        const isMatch = actual === testCase.expected;

        if (isMatch) {
            passed++;
        } else {
            failures.push({
                input: testCase.input,
                expected: testCase.expected,
                actual: actual || `(no canonical_title — status ${response.status})`
            });
        }

        console.log(`${isMatch ? "PASS" : "FAIL"}  "${testCase.input}" -> expected: ${testCase.expected}, got: ${actual}`);
    }

    console.log(`\n${passed} / ${cases.length} passed`);

    if (failures.length > 0) {
        console.log("\nFailures:");
        for (const f of failures) {
            console.log(`  "${f.input}" — expected "${f.expected}", got "${f.actual}"`);
        }
    }
}

runEval();