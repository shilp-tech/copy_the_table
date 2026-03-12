/*
  TableSnap - Server
  ------------------
  Setup:
    1. npm install
    2. Copy .env.example to .env and add your OpenAI API key:
         OPENAI_API_KEY=sk-...
    3. node server.js
    4. Open http://localhost:3000 in your browser
*/

require("dotenv").config();
const express = require("express");
const multer = require("multer");
const OpenAI = require("openai");
const path = require("path");
const { OAuth2Client } = require("google-auth-library");
const session = require("express-session");
const bcrypt = require("bcrypt");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
  fileFilter: (req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PNG, JPG, WEBP, and GIF images are allowed."));
    }
  },
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || "tabifi-dev-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 }, // 7 days
}));

// Serve all static HTML files (index, pricing, about, login)
app.use(express.static(path.join(__dirname)));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ── Auth routes ──────────────────────────────────────────────────────────────

// Verify Google ID token, create session
app.post("/auth/google", async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: "No credential provided." });
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(500).json({ error: "GOOGLE_CLIENT_ID not set in .env" });

  try {
    const client = new OAuth2Client();
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    // Save Google user to users.json if first time
    const users = loadUsers();
    if (!users.find(u => u.id === payload.sub)) {
      users.push({ id: payload.sub, name: payload.name, email: payload.email, picture: payload.picture, provider: "google", createdAt: new Date().toISOString() });
      saveUsers(users);
    }
    req.session.user = { id: payload.sub, name: payload.name, email: payload.email, picture: payload.picture };
    res.json({ ok: true, user: req.session.user });
  } catch (err) {
    console.error("Google token verification failed:", err.message);
    res.status(401).json({ error: "Invalid Google token: " + err.message });
  }
});

// Return current logged-in user
app.get("/auth/me", (req, res) => {
  if (req.session.user) return res.json({ user: req.session.user });
  res.status(401).json({ user: null });
});

// Logout
app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ── Email auth helpers ────────────────────────────────────────────────────────
const USERS_FILE = path.join(__dirname, "users.json");

function loadUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, "utf8")); }
  catch { return []; }
}
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// Register with email + password
app.post("/auth/register", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: "All fields are required." });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });

  const users = loadUsers();
  if (users.find(u => u.email === email)) return res.status(400).json({ error: "Email already registered." });

  const hash = await bcrypt.hash(password, 10);
  const user = { id: Date.now().toString(), name, email, hash, picture: null, provider: "email", createdAt: new Date().toISOString() };
  users.push(user);
  saveUsers(users);

  req.session.user = { id: user.id, name: user.name, email: user.email, picture: null };
  res.json({ ok: true, user: req.session.user });
});

// Login with email + password
app.post("/auth/login-email", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password are required." });

  const users = loadUsers();
  const user = users.find(u => u.email === email);
  if (!user || !user.hash) return res.status(401).json({ error: "Invalid email or password." });

  const match = await bcrypt.compare(password, user.hash);
  if (!match) return res.status(401).json({ error: "Invalid email or password." });

  req.session.user = { id: user.id, name: user.name, email: user.email, picture: user.picture };
  res.json({ ok: true, user: req.session.user });
});

// ── Admin: view all users ─────────────────────────────────────────────────────
app.get("/admin/users", (req, res) => {
  const users = loadUsers().map(({ hash, ...u }) => u); // strip password hashes
  const rows = users.map(u => `
    <tr>
      <td>${u.picture ? `<img src="${u.picture}" style="width:32px;height:32px;border-radius:50%;vertical-align:middle;">` : `<div style="width:32px;height:32px;border-radius:50%;background:#7c6cff;display:inline-flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:0.8rem;">${u.name[0].toUpperCase()}</div>`}</td>
      <td>${u.name}</td>
      <td>${u.email}</td>
      <td><span style="padding:3px 10px;border-radius:20px;font-size:0.75rem;background:${u.provider==='google'?'#1a3a2a':'#1a1a3a'};color:${u.provider==='google'?'#4ade80':'#a598ff'}">${u.provider || 'email'}</span></td>
      <td>${u.createdAt ? new Date(u.createdAt).toLocaleString() : '—'}</td>
    </tr>`).join('');
  res.send(`<!DOCTYPE html><html><head><title>Tabifi Users</title>
    <style>
      body{font-family:system-ui,sans-serif;background:#0a0a0a;color:#fff;padding:40px;margin:0}
      h1{font-size:1.4rem;margin-bottom:6px}p{color:#888;font-size:0.85rem;margin-bottom:24px}
      table{width:100%;border-collapse:collapse;background:#111;border-radius:12px;overflow:hidden}
      th{text-align:left;padding:12px 16px;font-size:0.75rem;text-transform:uppercase;letter-spacing:.05em;color:#555;border-bottom:1px solid #222}
      td{padding:12px 16px;font-size:0.875rem;border-bottom:1px solid #1a1a1a;vertical-align:middle}
      tr:last-child td{border-bottom:none}
    </style></head><body>
    <h1>Tabifi — Users</h1>
    <p>${users.length} total user${users.length !== 1 ? 's' : ''}</p>
    <table><thead><tr><th></th><th>Name</th><th>Email</th><th>Provider</th><th>Joined</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5" style="color:#555;text-align:center;padding:32px">No users yet</td></tr>'}</tbody></table>
  </body></html>`);
});

// ── Auth middleware ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session.user) return next();
  res.status(401).json({ error: "Please log in to use this feature.", redirect: "/login.html" });
}

// ── Shared helper ────────────────────────────────────────────────────────────

function parseGptJson(raw) {
  const jsonString = raw.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "").trim();
  return JSON.parse(jsonString);
}

async function callVision(base64Image, mimeType, prompt) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
              detail: "high",
            },
          },
        ],
      },
    ],
    max_tokens: 4096,
  });
  return response.choices[0].message.content.trim();
}

// ── POST /extract — single screenshot ────────────────────────────────────────

app.post("/extract", requireAuth, upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image uploaded." });
  if (!process.env.OPENAI_API_KEY)
    return res.status(500).json({ error: "OPENAI_API_KEY is not set in .env" });

  const base64Image = req.file.buffer.toString("base64");
  const mimeType = req.file.mimetype;

  try {
    const raw = await callVision(
      base64Image,
      mimeType,
      'Look at this image. Extract the table data. Return ONLY JSON: { "headers": ["col1", "col2"], "rows": [["val1", "val2"]] }. Nothing else.'
    );

    let tableData;
    try {
      tableData = parseGptJson(raw);
    } catch {
      return res.status(500).json({ error: "GPT returned invalid JSON. Raw: " + raw });
    }

    if (!tableData.headers || !tableData.rows)
      return res.status(500).json({ error: 'Response missing "headers" or "rows". Raw: ' + raw });

    res.json(tableData);
  } catch (err) {
    res.status(500).json({ error: err?.message || "Unknown error calling OpenAI API." });
  }
});

// ── POST /extract-one — single image from a multi-screenshot batch ───────────
// Body fields:
//   image  — the file
//   index  — 0-based position in the batch (0 = first, extracts headers+rows)

app.post("/extract-one", requireAuth, upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image uploaded." });
  if (!process.env.OPENAI_API_KEY)
    return res.status(500).json({ error: "OPENAI_API_KEY is not set in .env" });

  const index = parseInt(req.body.index ?? "0", 10);
  const base64Image = req.file.buffer.toString("base64");
  const mimeType = req.file.mimetype;

  const prompt =
    index === 0
      ? 'This is part 1 of a multi-part table. Extract the headers and all data rows. Return ONLY JSON: { "headers": ["col1", "col2"], "rows": [["val1", "val2"]] }. Nothing else.'
      : 'This is a continuation of a table. Extract data rows ONLY, do NOT include headers even if you see them. Return ONLY JSON: { "rows": [["val1", "val2"]] }. Nothing else.';

  try {
    const raw = await callVision(base64Image, mimeType, prompt);

    let tableData;
    try {
      tableData = parseGptJson(raw);
    } catch {
      return res.status(500).json({ error: "GPT returned invalid JSON. Raw: " + raw });
    }

    if (index === 0 && (!tableData.headers || !tableData.rows))
      return res.status(500).json({ error: 'First image response missing "headers" or "rows". Raw: ' + raw });

    if (index > 0 && !tableData.rows)
      return res.status(500).json({ error: 'Continuation image response missing "rows". Raw: ' + raw });

    res.json(tableData);
  } catch (err) {
    res.status(500).json({ error: err?.message || "Unknown error calling OpenAI API." });
  }
});

app.listen(PORT, () => {
  console.log(`TableSnap running at http://localhost:${PORT}`);
});
