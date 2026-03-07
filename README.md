# TableSnap

Upload a screenshot of any table and get a real, editable table you can paste directly into Word or Google Docs — with full formatting intact.

## The Problem

When AI chatbots (ChatGPT, Claude) generate tables in chat, copying and pasting them into Word or Google Docs loses all formatting and produces plain text. TableSnap fixes this by reading the table from a screenshot and copying it using the `text/html` clipboard format, so it pastes as a real table.

## Features

- **Single screenshot mode** — upload one image, extract the table instantly
- **Multi-screenshot stitching** — upload 2–10 screenshots of the same table, drag to reorder, and merge them into one combined table
- **Editable cells** — fix any OCR mistakes before copying
- **One-click copy** — copies as `text/html` so it pastes as a real table in Word, Google Docs, Notion, and more
- **Progress tracking** — per-image status badges and a progress bar when processing multiple screenshots

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express |
| Frontend | Vanilla HTML/CSS/JavaScript (single file) |
| AI | OpenAI GPT-4o Vision API |
| File uploads | multer |

## Project Structure

```
├── server.js         # Express server — receives images, calls OpenAI, returns JSON
├── index.html        # Full frontend UI (HTML + CSS + JS)
├── package.json      # Dependencies
├── .env              # Your API key (never committed)
└── .env.example      # Template for .env
```

## Setup

**1. Clone the repo**
```bash
git clone https://github.com/shilp-tech/copy_the_table.git
cd copy_the_table
```

**2. Install dependencies**
```bash
npm install
```

**3. Add your OpenAI API key**
```bash
cp .env.example .env
# Open .env and replace sk-your-key-here with your real key
```

**4. Start the server**
```bash
node server.js
```

**5. Open in browser**
```
http://localhost:3000
```

## How It Works

### Single Mode
1. Upload a screenshot (PNG/JPG/WEBP)
2. Server sends the image to GPT-4o Vision with a prompt to extract table data as JSON
3. Frontend renders the JSON as an editable HTML table
4. Click **Copy Table** — copies using `ClipboardItem` with `text/html` MIME type
5. Paste into Word or Google Docs — full table formatting preserved

### Multi-Screenshot Mode
1. Upload 2–10 screenshots of the same table (e.g. a long table split across multiple screens)
2. Drag thumbnails to set the correct order
3. Click **Process All** — images are sent to OpenAI one by one:
   - First image: extracts headers + rows
   - Every subsequent image: extracts rows only (headers skipped)
4. All rows are merged into one combined table
5. Edit and copy as normal

### The Core Trick

```js
navigator.clipboard.write([
  new ClipboardItem({
    "text/html": new Blob([html], { type: "text/html" })
  })
])
```

Copying with `text/html` stores actual HTML in the OS clipboard. Word and Google Docs both read this format on paste, reconstructing the table with real cells instead of plain text.

## Requirements

- Node.js 18+
- An OpenAI API key with access to `gpt-4o`
