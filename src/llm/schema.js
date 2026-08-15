const { z } = require("zod");

// The closed list of allowed canonical titles, straight from JOB-CARD.md.
const CANONICAL_TITLES = [
    "Software Engineer",
    "Senior Software Engineer",
    "Staff Software Engineer",
    "Engineering Manager",
    "Product Manager",
    "Data Scientist",
    "Data Engineer",
    "Designer",
    "Other"
];

// Input validation — checked before any model call is ever made.
const NormalizeInputSchema = z.object({
    text: z.string().min(1, "text is required").max(200, "text must be 200 characters or fewer")
});

// Output validation — what the model's answer must match before we
// trust it enough to return it to the caller.
const NormalizeOutputSchema = z.object({
    canonical_title: z.enum(CANONICAL_TITLES),
    confidence: z.number().min(0).max(1),
    reason: z.string().min(1)
});

module.exports = { NormalizeInputSchema, NormalizeOutputSchema, CANONICAL_TITLES };