const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'saved_words.json');

// 🔹 تهيئة Supabase (يحتاج متغيرات بيئة)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // يخدم qamos.html & dictionary.json

// 📌 Middleware تسجيل الزيارات (يعمل في الخلفية Fire-and-Forget)
app.use((req, res, next) => {
  (async () => {
    try {
      const ip =
        req.headers['x-forwarded-for']?.split(',')[0].trim() ||
        req.headers['x-real-ip'] ||
        req.socket.remoteAddress || 'unknown';

      await supabase.from('visits').insert({ ip_address: ip });
    } catch (err) {
      console.error('⚠️ خطأ في تسجيل الزيارة:', err.message);
    }
  })();
  next();
});

// ── Helpers ─────────────────────────────────────────────────────────────────
function readStore() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeStore(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function getUserId(req) {
  const ip =
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.socket.remoteAddress || 'unknown';
  const ua = req.headers['user-agent'] || 'unknown';
  return crypto
    .createHash('sha256')
    .update(ip + '|' + ua)
    .digest('hex')
    .slice(0, 32);
}

// ── Routes ───────────────────────────────────────────────────────────────────
app.get('/api/saved', (req, res) => {
  const uid = getUserId(req);
  const store = readStore();
  res.json({ savedWords: store[uid] || {} });
});

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

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ القاموس يعمل على: http://localhost:${PORT}`);
});
