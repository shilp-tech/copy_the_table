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

// Serve index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

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

app.post("/extract", upload.single("image"), async (req, res) => {
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

app.post("/extract-one", upload.single("image"), async (req, res) => {
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
