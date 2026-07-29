# AquaGreen AI chat server

A small Express server that proxies chat requests to OpenAI, Anthropic, or
Google Gemini. It keeps your LLM API key on the server — the browser never
sees it — which is the safe way to run the "Chat with AquaGreen AI" feature
in production.

## Setup

```bash
cd server
npm install
cp .env.example .env
```

Edit `.env` and set:
- `CHAT_PROVIDER` to `openai`, `anthropic`, or `gemini`
- The matching key: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GEMINI_API_KEY`
  (get a Gemini key from https://aistudio.google.com/apikey)
- `ALLOWED_ORIGIN` to the origin your site is served from (or `*` while testing locally)

## Run

```bash
npm start
```

The server listens on `http://localhost:8787` by default (override with `PORT`).

Check it's up:

```bash
curl http://localhost:8787/health
```

## API

`POST /api/chat`

```json
{
  "systemPrompt": "You are ...",
  "messages": [
    { "role": "user", "content": "Hello" }
  ]
}
```

Returns:

```json
{ "reply": "..." }
```

Requests are rate-limited to 20 per minute per IP, and message/body sizes are
capped, to keep the server (and your API budget) safe from abuse.

## Pointing the site at this server

In `index.html`, open the chat's ⚙️ settings panel and set the "Backend URL"
to where this server is reachable, e.g. `http://localhost:8787/api/chat` for
local testing, or your deployed server's URL in production
(e.g. `https://your-server.example.com/api/chat`).
