import { useEffect, useState } from "react";
import { authFetch } from "@/lib/api";

interface SavedFilm {
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  added_at: string;
}

export function WatchLaterList() {
  const [films, setFilms] = useState<SavedFilm[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authFetch("/api/watch-later")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Server responded with ${response.status}`);
        }
        return response.json();
      })
      .then((data: SavedFilm[]) => setFilms(data))
      .catch((err) => {
        console.error("Failed to load Watch later:", err);
        setError("Couldn't load your list. Try again later.");
      });
  }, []);

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (films === null) {
    return <p className="text-sm text-muted-foreground">Loading your list...</p>;
  }

  if (films.length === 0) {
    return <p className="text-muted-foreground">Nothing saved yet. Pick a film and hit Watch later.</p>;
  }

  return (
    <ul className="flex w-full max-w-sm flex-col gap-3">
      {films.map((film) => (
        <li key={film.tmdb_id} className="flex items-center gap-3 rounded-lg border p-2">
          {film.poster_path ? (
            <img
              src={`https://image.tmdb.org/t/p/w92${film.poster_path}`}
              alt=""
              className="h-16 w-11 rounded object-cover"
            />
          ) : (
            <div className="h-16 w-11 rounded bg-muted" />
          )}
          <span className="font-medium">{film.title}</span>
        </li>
      ))}
    </ul>
  );
}