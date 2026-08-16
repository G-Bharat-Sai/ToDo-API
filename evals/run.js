const fs = require("fs");
const path = require("path");

const CASES_PATH = path.join(__dirname, "cases.json");
const cases = JSON.parse(fs.readFileSync(CASES_PATH, "utf-8"));

const ENDPOINT = "http://localhost:3000/normalize";

async function runOneCase(testCase) {
    const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: testCase.input })
    });

    const body = await response.json();

    if (testCase.input === "") {
        const isMatch = response.status === 400;
        return { isMatch: isMatch, actual: "(400 - " + (body.error || "no error message") + ")" };
    }

    const actual = body.canonical_title;
    const isMatch = actual === testCase.expected;
    return { isMatch: isMatch, actual: actual || ("(no canonical_title - status " + response.status + ")"), fullBody: body };
}

async function runEval() {
    var categories = {};
    var failures = [];

    for (var i = 0; i < cases.length; i++) {
        var testCase = cases[i];
        var result = await runOneCase(testCase);
        var cat = testCase.difficulty;

        if (!categories[cat]) categories[cat] = { total: 0, passed: 0 };
        categories[cat].total++;
        if (result.isMatch) categories[cat].passed++;

        if (!result.isMatch) {
            failures.push({
                input: testCase.input,
                expected: testCase.expected,
                actual: result.actual,
                difficulty: testCase.difficulty
            });
        }

        console.log((result.isMatch ? "PASS" : "FAIL") + "  [" + testCase.difficulty + "]  \"" + testCase.input + "\" -> expected: " + testCase.expected + ", got: " + result.actual);

        // For injection cases specifically, also print the full raw
        // response - if an attack partially succeeded (e.g. a weird
        // confidence value came through even though canonical_title
        // matched), we want to actually see it, not just PASS/FAIL.
        if (testCase.difficulty === "injection" && result.fullBody) {
            console.log("        full response: " + JSON.stringify(result.fullBody));
        }
    }

    var totalPassed = 0;
    var totalCount = 0;
    console.log("\nBy category:");
    for (var catName in categories) {
        var c = categories[catName];
        totalPassed += c.passed;
        totalCount += c.total;
        console.log("  " + catName + ": " + c.passed + " / " + c.total);
    }
    console.log("\nOverall: " + totalPassed + " / " + totalCount + " passed");

    if (failures.length > 0) {
        console.log("\nFailures:");
        for (var j = 0; j < failures.length; j++) {
            var f = failures[j];
            console.log("  [" + f.difficulty + "] \"" + f.input + "\" - expected \"" + f.expected + "\", got \"" + f.actual + "\"");
        }
    }
}

runEval();
