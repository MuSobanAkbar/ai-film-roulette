# DecideAlready

A button that picks a film, so you stop scrolling. It tells you what the film is about without spoiling it, and if you sign in, it remembers what you've saved and never suggests those films again.

**Live:** https://decidealready.onrender.com/
*(It runs on Render's free tier, so the first load after a quiet spell takes about 30 seconds to wake up.)*

I built this for me and a friend. We watch films together and can never decide what to put on, so now a button decides for us.

---

## What it does

1. Click **Pick a film** and you get a random popular film: poster, title and year on a card.
2. An AI writes a short, spoiler-free teaser, typed out as you watch.
3. TMDB's full synopsis is there too, blurred like a spoiler tag. Click it only if you don't mind knowing.
4. Sign in with an email link, and a **Watch later** button appears on the card.
5. Anything you save never comes up again when you pick a film, and you can see everything you've saved in the **Watch later** view.

---

## How it works

```
Browser ──► React (Vite) ──► FastAPI ──► TMDB API          (films, posters, synopses)
   │                            ├──────► Groq LLM          (spoiler-free teaser)
   │                            └──────► Supabase Postgres (Watch later list)
   └── Supabase Auth (email sign-in link)
```

FastAPI also serves the built frontend, so one service handles both the page and the API.

### The routes

| Route | What it does | Sign-in |
|---|---|---|
| `GET /api/health` | "I'm alive" check for Render | no |
| `GET /api/random` | A random film. If you're signed in, it skips anything on your Watch later list | optional |
| `GET /api/overview/{movie_id}` | The spoiler-free AI teaser for one film | no |
| `GET /api/me` | Returns your user id (handy for checking sign-in works) | required |
| `POST /api/watch-later` | Saves a film to your list | required |
| `GET /api/watch-later` | Your saved films, newest first | required |
| `DELETE /api/watch-later/{tmdb_id}` | Removes a film from your list | required |

### The AI teaser

`/api/overview/{movie_id}` follows the same six steps every time: check the cache, fetch the synopsis from TMDB, build the prompt, ask the LLM, turn any failure into a clear status code (502 / 503 / 504), then save the answer in the cache. The LLM sits behind a small adapter (`backend/llm.py`) with a timeout, a retry limit, its own error types and a check that rejects empty or cut-off answers.

### Sign-in and the Watch later list

Sign-in is a magic link from Supabase Auth. Your session is stored in the browser, so restarting the server or refreshing the page doesn't sign you out.

When the frontend calls a route that needs to know who you are, it sends your access token. FastAPI checks that token itself using Supabase's public keys (ES256, via JWKS), so it never has to call Supabase on every request.

Saved films live in a `watch_later` table in Postgres. The backend talks to the database through one file, `backend/db.py`, the same pattern as the LLM adapter.

---

## Security decisions

A few choices I made on purpose, and why:

- **API keys stay on the server.** If the browser called TMDB or Groq directly, the keys would be visible to anyone who opens DevTools.
- **The browser only ever sends a film id.** The backend looks up the real title, synopsis and poster from TMDB itself, so nobody can send their own text to the AI or save a fake title.
- **Who you are comes from your token, never from the request.** You can only save or remove films on your own list. There's no way to say "do this for another user."
- **The database is locked down twice.** Row Level Security is on, and only the backend's role is granted access to the `watch_later` table. The browser can't reach it at all.
- **The backend uses Supabase's secret key, which skips Row Level Security,** so every database function filters by user. A test fails if that filter is ever removed.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + TypeScript (Vite), Tailwind CSS v4, shadcn/ui |
| Backend | Python + FastAPI |
| AI | Groq (`openai/gpt-oss-120b`), behind `backend/llm.py` |
| Auth + database | Supabase (magic-link sign-in, Postgres), token checks with PyJWT |
| Film data | TMDB API |
| Tests | pytest (backend), Vitest + React Testing Library (frontend) |
| Quality | ruff, ESLint, `tsc --noEmit` |
| Container | Docker, multi-stage (Node builds the frontend, Python runs the app) |
| CI | GitHub Actions: lint, type checks, tests, Docker build |
| Hosting | Render (auto-deploys from `main`) |

---

## Run it locally

You'll need Node 22, Python 3.12, and accounts with [TMDB](https://www.themoviedb.org/settings/api), [Groq](https://console.groq.com/keys) and [Supabase](https://supabase.com/).

**1. Set up the database.** In your Supabase project's SQL Editor, run the files in `db/` in order. They create the `watch_later` table, turn on Row Level Security and grant the backend access.

**2. Add your keys** to a `.env` file in the **main folder** (one file for both frontend and backend):

```
TMDB_API_KEY=your_tmdb_key
GROQ_API_KEY=your_groq_key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Only variables starting with `VITE_` reach the browser. The secret key must never have that prefix.

**3. Install everything:**

```bash
cd backend
pip install -r requirements.txt
cd ../frontend
npm install
```

**4. Start both servers with one command** (from `frontend/`):

```bash
npm run dev:all
```

Open http://localhost:5173. In Supabase, add `http://localhost:5173` to **Authentication → URL Configuration** so sign-in links bring you back here.

**Or run it the way Render does**, in Docker:

```bash
docker compose up --build
```

---

## Tests

```bash
cd backend && pytest -v       # backend
cd frontend && npm test       # frontend
```

Tests never call real services. TMDB, Groq and Supabase are all swapped for fakes, so the tests run in under a second, don't need any keys, and still pass when those services are down. The backend tests cover:

- **The LLM adapter:** every way it can end (timeout, rate limit, other errors, cut-off answers, and a clean answer)
- **The database adapter:** it returns a set of ids, and it only ever reads the signed-in user's rows
- **Saving a film:** it needs sign-in, it uses TMDB's title rather than the browser's, and it rejects films that don't exist
- **Picking a film:** signed-in users never get a saved film, and guests don't touch the database at all

---

## Checkpoints

### v1: the button (26 Sep 2026)
A button that picks a random film, a FastAPI backend that keeps the TMDB key hidden, a Docker image, CI and a deploy on Render.

### v1.1: the safety net
A health check, the first pytest tests with TMDB faked, a Vitest test, ESLint and TypeScript checks in CI, and branch protection so every change goes through an Issue, a branch and a PR.

### v2: it looks like an app (early Oct 2026)
Tailwind v4 and shadcn/ui, a film card with poster and year, a loading skeleton and a friendly error state.

### v3: the spoiler-free AI teaser (mid Oct 2026)
The LLM adapter, the overview route with a prompt, cache and proper error codes, the teaser on the card with a typewriter effect, and TMDB's synopsis hidden behind a click.

### v4: sign-in and Watch later (late Oct 2026)
Magic-link sign-in, token checks in FastAPI, the `watch_later` table, the database adapter, the Watch later button, "never show a saved film again," and the Watch later view.

---

## Things that broke (and what they taught me)

Most of what I learned on this project came from things going wrong.

- **Tailwind wouldn't work with shadcn.** The project was set up for Tailwind v3, and shadcn expects v4. *Set up Tailwind v4 and the `@` alias first, then shadcn.*
- **The frontend got HTML instead of JSON.** In dev mode, Vite answered `/api/...` with the web page because nothing told it to forward API calls to FastAPI. *A Vite proxy fixed it.*
- **CI found three hidden bugs the first time it ran pytest.** Wrong import paths, a missing key and a wrong patch path, all hidden because the tests had only ever run on my laptop. *Run tests on a clean machine.*
- **"Merged" didn't mean "deployed."** Render kept serving an old version because new deploys crashed on startup with `No module named 'llm'`. Uvicorn was starting from the wrong folder. *CI checked that the image builds, not that it starts. Always check the live site after merging.*
- **The live AI route returned 500** with `KeyError: 'GROQ_API_KEY'`. The key was in my local `.env`, which Render never sees. *Every secret has to be set on the host too.*
- **The live site went blank after adding sign-in.** Vite bakes `VITE_` variables into the site at build time, and the Docker build didn't have them. *Pass them into the build with `ARG` and `ENV` in the Dockerfile.*
- **CI couldn't install the backend's libraries.** I'd pinned PyJWT at 2.10.1, but Supabase's library needs 2.12 or newer. My laptop had a newer version, so it worked locally. *A pinned version can quietly contradict another library's needs.*
- **Sign-in emails stopped arriving.** Supabase's built-in email sender only allows a few emails an hour. *It's for testing only; a real app needs its own email provider.*

---

## Known limitations

- **Cold starts:** Render's free tier sleeps after 15 minutes without traffic, so the first visit afterwards takes about 30 seconds.
- **Sign-in emails are rate-limited** by Supabase's built-in sender, so only a handful of people can request links each hour.
- **The AI teaser cache forgets** whenever Render restarts or sleeps, because it's kept in memory.
- **AI rate limits:** Groq's free tier allows about 8,000 tokens a minute. A burst of new films can hit that, and you'll see a friendly "try again shortly."
- **Films with no poster or release date** come back as `"Unknown"` from `/api/random`, which can show a broken image or a wrong year badge.
- **There's no Remove button in the Watch later view yet.** The backend route exists (`DELETE /api/watch-later/{tmdb_id}`), but I stopped before adding it to the page.

---

## If I came back to it

- A real email provider for sign-in links
- The Remove button on the Watch later view
- Return `null` instead of `"Unknown"` for missing posters and dates
- A 20-case spoiler eval for the AI teaser, with the score in this README
- Tests for the overview route, including a cache hit
- Pin every backend dependency, and start the Docker container in CI to catch startup crashes
- Keep the teaser cache in Postgres so it survives restarts

---

## Credits

Film data from [TMDB](https://www.themoviedb.org/). This product uses the TMDB API but is not endorsed or certified by TMDB.

Spoiler-free teasers are generated by an open-weight model served by [Groq](https://groq.com/). Sign-in and the database run on [Supabase](https://supabase.com/).