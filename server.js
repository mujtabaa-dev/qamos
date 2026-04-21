const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'saved_words.json');

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // serves qamos.html, dictionary.json, etc.

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Read the entire store from disk (returns {} on first run) */
function readStore() {
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch {
        return {};
    }
}

/** Persist the store to disk */
function writeStore(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Build a stable, anonymous user-ID from the request.
 * We hash: real IP  +  User-Agent
 * The hash is one-way - no PII is stored on disk.
 */
function getUserId(req) {
    // Support proxies (Nginx, Cloudflare, Railway, Render, etc.)
    const ip =
        req.headers['x-forwarded-for']?.split(',')[0].trim() ||
        req.headers['x-real-ip'] ||
        req.socket.remoteAddress ||
        'unknown';

    const ua = req.headers['user-agent'] || 'unknown';

    return crypto
        .createHash('sha256')
        .update(ip + '|' + ua)
        .digest('hex')
        .slice(0, 32); // 32 hex chars is plenty
}

// ── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/saved
 * Returns the saved words object for the calling user.
 * Response: { savedWords: { "word": true, ... } }
 */
app.get('/api/saved', (req, res) => {
    const uid = getUserId(req);
    const store = readStore();
    res.json({ savedWords: store[uid] || {} });
});

/**
 * POST /api/saved
 * Body: { savedWords: { "word": true, ... } }
 * Replaces the entire saved-words map for the calling user.
 * Response: { ok: true }
 */
app.post('/api/saved', (req, res) => {
    const uid = getUserId(req);
    const { savedWords } = req.body;

    if (!savedWords || typeof savedWords !== 'object') {
        return res.status(400).json({ error: 'Invalid payload' });
    }

    const store = readStore();
    store[uid] = savedWords;
    writeStore(store);
    res.json({ ok: true });
});

/**
 * POST /api/toggle
 * Body: { word: "hello" }
 * Toggles a single word for the calling user (add / remove).
 * Response: { saved: true/false, word: "hello" }
 */
app.post('/api/toggle', (req, res) => {
    const uid = getUserId(req);
    const { word } = req.body;

    if (!word || typeof word !== 'string') {
        return res.status(400).json({ error: 'Invalid payload' });
    }

    const store = readStore();
    if (!store[uid]) store[uid] = {};

    const isSaved = !!store[uid][word];
    if (isSaved) {
        delete store[uid][word];
    } else {
        store[uid][word] = true;
    }

    writeStore(store);
    res.json({ saved: !isSaved, word });
});

/**
 * GET /api/stats
 * Returns basic statistics about the dictionary.
 */
app.get('/api/stats', (req, res) => {
    const dictPath = path.join(__dirname, 'public', 'dictionary.json');
    try {
        const dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
        const totalWords = Object.keys(dict).length;
        const store = readStore();
        const uid = getUserId(req);
        const savedCount = store[uid] ? Object.keys(store[uid]).length : 0;
        res.json({ totalWords, savedCount });
    } catch {
        res.json({ totalWords: 0, savedCount: 0 });
    }
});

// ── SPA Fallback ────────────────────────────────────────────────────────────
// Serve qamos.html for root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'Index.html'));
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`✅  القاموس يعمل على: http://localhost:${PORT}`);
});
