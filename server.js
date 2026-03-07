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
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// Store upload in memory so we can base64-encode it for the Vision API
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
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

// POST /extract — receives image, returns table JSON
app.post("/extract", upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No image uploaded." });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY is not set in .env" });
  }

  const base64Image = req.file.buffer.toString("base64");
  const mimeType = req.file.mimetype;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: 'Look at this image. Extract the table data. Return ONLY JSON: { "headers": ["col1", "col2"], "rows": [["val1", "val2"]] }. Nothing else.',
            },
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

    const raw = response.choices[0].message.content.trim();

    // Strip markdown code fences if GPT wraps it anyway
    const jsonString = raw.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "").trim();

    let tableData;
    try {
      tableData = JSON.parse(jsonString);
    } catch {
      return res.status(500).json({
        error: "GPT returned invalid JSON. Raw response: " + raw,
      });
    }

    if (!tableData.headers || !tableData.rows) {
      return res.status(500).json({
        error: 'Response missing "headers" or "rows". Raw: ' + raw,
      });
    }

    res.json(tableData);
  } catch (err) {
    const message = err?.message || "Unknown error calling OpenAI API.";
    res.status(500).json({ error: message });
  }
});

app.listen(PORT, () => {
  console.log(`TableSnap running at http://localhost:${PORT}`);
});
