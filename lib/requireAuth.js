const supabase = require("./supabaseClient");

async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Access token required" });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({ error: "Access token required" });
    }

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
        return res.status(401).json({ error: "Invalid or expired token" });
    }

    // Attach the verified user to the request object, so any route
    // handler that runs after this middleware can read req.user
    // directly instead of re-verifying the token itself.
    req.user = data.user;
    next();
}

module.exports = requireAuth;