import os
import random

import db
import httpx
import llm
import requests
from auth import get_current_user_id, get_optional_user_id
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from prompts import PROMPT_VERSION, build_overview_prompt
from pydantic import BaseModel

load_dotenv()

app = FastAPI()

# stops CORS errors when making requests from the frontend to the backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_KEY = os.getenv("TMDB_API_KEY")

# check if api key is there
if not API_KEY:
    raise ValueError("TMDB_API_KEY is not set in the environment variables, please set it in the .env file.")

async def get_movie_details(movie_id: int) -> dict | None:
    async with httpx.AsyncClient(timeout=5.0) as client:
        response = await client.get(
            f"https://api.themoviedb.org/3/movie/{movie_id}",
            params={"api_key": API_KEY},
        )

    if response.status_code == 404:
        return None

    response.raise_for_status()
    return response.json()



class OverviewResponse(BaseModel):
    movie_id: int
    overview: str

overview_cache: dict[tuple[int, str], str] = {}

@app.get("/api/health")
def health_check():
    return {"status":"ok"}

@app.get("/api/overview/{movie_id}", response_model=OverviewResponse)
async def get_overview(movie_id: int):
   
    cache_key = (movie_id, PROMPT_VERSION)
    if cache_key in overview_cache:
        return OverviewResponse(movie_id=movie_id, overview=overview_cache[cache_key])


    try:
        details = await get_movie_details(movie_id)
    except httpx.HTTPError:
        raise HTTPException(502, "Couldn't reach the film database.")

    if details is None:
        raise HTTPException(404, "Film not found")

    synopsis = details.get("overview") or ""
    if not synopsis:
        raise HTTPException(404, "This film has no synopsis to work from")


    prompt = build_overview_prompt(details["title"], synopsis)

    try:
        text = await llm.complete(prompt)
    except llm.LLMTimeout:
        raise HTTPException(504, "The AI took too long. Try again.")
    except llm.LLMRateLimited:
        raise HTTPException(503, "Too many requests right now. Try again shortly.")
    except llm.LLMError:
        raise HTTPException(502, "The AI service had a problem.")


    overview_cache[cache_key] = text
    return OverviewResponse(movie_id=movie_id, overview=text)

class SaveFilmRequest(BaseModel):
    tmdb_id: int

@app.get("/api/random")
def get_random_movie(user_id: str | None = Depends(get_optional_user_id)):
    saved = db.saved_tmdb_ids(user_id) if user_id else set()
    random_page = random.randint(1, 500)

    url = "https://api.themoviedb.org/3/discover/movie"
    params = {
        "api_key": API_KEY,
        "language": "en-US",
        "page": random_page,
        "include_adult": "false",
        "vote_count.gte": 100,  # ensures the movies actually have reviews
    }

    response = requests.get(url,params=params)

    if response.status_code == 200:
        data = response.json()  
        movie_list = data.get("results", [])
        movie_list = [movie for movie in movie_list if movie["id"] not in saved]


    if movie_list:
        movie = random.choice(movie_list)  # pick random movie from list.
        movie.get("poster_path")  # get poster path to display in frontend

     
        
        return {"title": movie.get("title"),"id": movie.get("id"), "overview": movie.get("overview"), "date": movie.get("release_date") or "Unknown", "poster_path": movie.get("poster_path") or "Unknown"}

    else:
        print(f"Error fetching data: {response.status_code}")

@app.post("/api/watch-later")
async def save_to_watch_later(
    body: SaveFilmRequest,
    user_id: str = Depends(get_current_user_id),
):
    try:
        details = await get_movie_details(body.tmdb_id)
    except httpx.HTTPError:
        raise HTTPException(502, "Couldn't reach the film database.")

    if details is None:
        raise HTTPException(404, "Film not found")

    await run_in_threadpool(
        db.add_to_watch_later,
        user_id,
        body.tmdb_id,
        details["title"],
        details.get("poster_path"),
    )

    return {"saved": True, "tmdb_id": body.tmdb_id}

@app.get("/api/me")
def me(user_id: str = Depends(get_current_user_id)):
    return {"user_id": user_id}

@app.get("/api/watch-later")
def get_watch_later(user_id: str = Depends(get_current_user_id)):
    return db.list_watch_later(user_id)

@app.delete("/api/watch-later/{tmdb_id}")
def remove_watch_later(tmdb_id: int, user_id: str = Depends(get_current_user_id)):
    db.remove_from_watch_later(user_id, tmdb_id)
    return {"removed": True, "tmdb_id": tmdb_id}

if os.path.exists("frontend/dist"):
  app.mount("/", StaticFiles(directory="frontend/dist", html=True), name="static")