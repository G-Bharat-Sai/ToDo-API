const { z } = require("zod");

const NormalizeInputSchema = z.object({
  text: z.string().min(1).max(200)
});

const NormalizeOutputSchema = z.object({
  canonical_title: z.enum([
    "Software Engineer",
    "Senior Software Engineer",
    "Staff Software Engineer",
    "Engineering Manager",
    "Product Manager",
    "Data Scientist",
    "Data Engineer",
    "Designer",
    "Other"
  ]),
  confidence: z.number().min(0).max(1),
  reason: z.string()
});

module.exports = { NormalizeInputSchema, NormalizeOutputSchema };
