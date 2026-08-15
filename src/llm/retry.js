function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

// Only these are worth retrying: a timeout might just be a slow
// moment, 429 means we are being rate limited (temporary), 5xx means
// the server had a problem (possibly temporary). A 400/401/403 will
// still be exactly as wrong on the next attempt - a bad API key does
// not become a good one four seconds later, and retrying it just
// burns time and (on a metered provider) quota for nothing.
function isRetryable(err) {
    if (err.status === undefined) {
        return true;
    }
    if (err.status === 429) {
        return true;
    }
    if (err.status >= 500) {
        return true;
    }
    return false;
}

// Exponential backoff with jitter: 1s, 2s, 4s, each plus a small
// random amount, so if multiple clients are retrying at once they do
// not all hammer the server at exactly the same instant.
async function withRetry(fn, maxAttempts) {
    var attempts = maxAttempts || 2;
    var lastError;

    for (var attempt = 0; attempt < attempts; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;

            if (!isRetryable(err) || attempt === attempts - 1) {
                throw err;
            }

            var baseDelay = Math.pow(2, attempt) * 1000;
            var jitter = Math.random() * 300;
            await sleep(baseDelay + jitter);
        }
    }

    throw lastError;
}

module.exports = { withRetry: withRetry, isRetryable: isRetryable };
