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

    // Empty input is expected to be rejected by input validation
    // before ever reaching the model - a 400 there is a PASS, not
    // a missing canonical_title.
    if (testCase.input === "") {
        const isMatch = response.status === 400;
        return { isMatch: isMatch, actual: "(400 - " + (body.error || "no error message") + ")" };
    }

    const actual = body.canonical_title;
    const isMatch = actual === testCase.expected;
    return { isMatch: isMatch, actual: actual || ("(no canonical_title - status " + response.status + ")") };
}

async function runEval() {
    var totalPassed = 0;
    var easyTotal = 0;
    var easyPassed = 0;
    var hardTotal = 0;
    var hardPassed = 0;
    var failures = [];

    for (var i = 0; i < cases.length; i++) {
        var testCase = cases[i];
        var result = await runOneCase(testCase);

        if (testCase.difficulty === "easy") {
            easyTotal++;
            if (result.isMatch) easyPassed++;
        } else {
            hardTotal++;
            if (result.isMatch) hardPassed++;
        }

        if (result.isMatch) {
            totalPassed++;
        } else {
            failures.push({
                input: testCase.input,
                expected: testCase.expected,
                actual: result.actual,
                difficulty: testCase.difficulty
            });
        }

        console.log((result.isMatch ? "PASS" : "FAIL") + "  [" + testCase.difficulty + "]  \"" + testCase.input + "\" -> expected: " + testCase.expected + ", got: " + result.actual);
    }

    console.log("\nOverall: " + totalPassed + " / " + cases.length + " passed");
    console.log("Easy:    " + easyPassed + " / " + easyTotal + " passed");
    console.log("Hard:    " + hardPassed + " / " + hardTotal + " passed");

    if (failures.length > 0) {
        console.log("\nFailures:");
        for (var j = 0; j < failures.length; j++) {
            var f = failures[j];
            console.log("  [" + f.difficulty + "] \"" + f.input + "\" - expected \"" + f.expected + "\", got \"" + f.actual + "\"");
        }
    }
}

runEval();
