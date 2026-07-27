const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error(
        "Missing SUPABASE_URL or SUPABASE_KEY in .env — check your .env file exists and both are set."
    );
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;