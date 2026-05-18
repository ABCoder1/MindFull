# MindFull
MindFull is a local-first web app that records meeting audio, transcribes speech using a Whisper-style model via a Groq API, and generates live, contextual suggestions and detailed answers using a chat model. It pairs a small static frontend (in `main.js`) with a FastAPI backend (in `api/index.py`) that proxies requests to the Groq SDK.

**Key features**
- **Live transcription**: capture audio from the browser and transcribe using a cloud model via the backend.
- **Live suggestions**: generate prioritized, short suggestions (questions, talking points, answers, facts) from recent transcript context.
- **Streamed chat answers**: request detailed, streaming responses informed by transcript, chat history, and active suggestions.
- **Local settings & export**: client-side settings (API key, prompts, context windows) and transcript export to a local .txt file.

**Repository layout**
- **api/**: FastAPI backend endpoints ([api/index.py](api/index.py#L1)).
- **static frontend files/**: ([index.html](public/index.html#L1), [main.js](public/main.js#L1), [index.css](public/index.css#L1)).
- **prompts.json**: prompt templates used by the frontend to drive suggestions and chat behavior.
- **requirements.txt**: Python dependencies for the backend.
- **package.json**: (optional) contains `http-server` for serving the frontend in development.

**Prerequisites**
- Python 3.11+ (recommended)
- Node.js (optional, for serving frontend with `http-server`)
- A Groq API key with access to the audio transcription and chat/completion endpoints used by this project.

**Setup [backend]**
1. Create and activate a virtual environment (recommended).

```bash
python -m venv .venv
source .venv/bin/activate
```

2. Install Python dependencies:

```bash
pip install -r requirements.txt
```

3. Run the FastAPI server (development):

```bash
# From repository root
uvicorn api.index:app --reload --port 8000
```

The backend exposes API endpoints under `/api/*` (for example `/api/transcribe`, `/api/suggest`, `/api/chat`) and expects the frontend to POST form data including an `api_key` (Groq API key) and other fields.

**Setup [frontend] (development)**
The frontend is static and lives in the root of the repository (`./`). You can open `./index.html` directly in a browser (some features require a server) or serve the folder with a static server.

Using `http-server` (if you have Node):

```bash
# install globally if needed
npm install -g http-server
# serve the folder on port 8080
http-server -p 8080
```

Open http://localhost:8080 and set your Groq API key in the Settings modal. The frontend now defaults to same-origin `/api` requests, and only uses the Backend URL Override field for local development when the API runs on a separate host.

**Configuration & prompts**
- `prompts.json` contains the prompt templates used by the frontend for suggestion and chat behavior. Edit these to tune phrasing, output format, or instruction style.
- Client settings (API key, context windows, prompt overrides, auto-export) are stored in `localStorage` by the browser; the Groq API key is never persisted server-side by this project.

**How it works (high level)**
- The frontend records short audio batches (MediaRecorder) and periodically POSTs the audio blob to `/api/transcribe`.
- The backend uploads the audio buffer to the Groq audio transcription API (`whisper-large-v3`) and returns text.
- The frontend accumulates transcript context and requests suggestions by POSTing to `/api/suggest` with a system prompt (from `prompts.json`). The backend uses a chat/completion call to generate suggestions and returns parsed JSON.
- For detailed answers, the frontend calls `/api/chat`. The backend may stream chat completions back; the frontend renders partial chunks in real time.

**Security notes**
- This repo is wired for local development. The frontend sends the Groq API key from the browser to the backend in form fields, so treat that key like any secret.
- The backend now uses an allowlist for CORS origins. Set `CORS_ORIGINS` or `FRONTEND_ORIGIN` in production instead of using a wildcard.

**Running locally [quick commands]**

```bash
# 1) start backend
uvicorn api.index:app --reload --port 8000
# 2) serve frontend (from repo root)
http-server -p 8080
# 3) open http://localhost:8080 in your browser
```

**Development tips**
- Edit prompts in `prompts.json` to change assistant behavior.
- Use browser devtools to inspect network requests from `main.js` to the backend.
- If streaming responses fail in some environments, the backend returns a full response fallback, check server logs for tracebacks.

**Deployment**
- The repository is now Vercel-friendly: the static frontend stays in the repository's root `./`, the FastAPI backend lives under `api/`, and `vercel.json` rewrites `/` to `/index.html`.
- Leave the Backend URL Override blank in production so the browser talks to the same origin at `/api/*`.
- If you need to point the frontend at a separate backend while developing locally, set the override in the Settings modal instead of editing source code.

**Troubleshooting**
- 500 responses from `/api/transcribe` or `/api/suggest` usually indicate an issue with the Groq client or invalid/missing API key, check server logs.
- If the browser cannot access the microphone, confirm `getUserMedia` permission and use HTTPS for hosted deployments.

**Contributing**
- If you find bugs or have suggestions, please open an issue or submit a pull request. Contributions to improve prompts, UI/UX, or backend functionality are welcome!

---
