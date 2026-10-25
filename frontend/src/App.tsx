import { useState } from 'react'
import { OverviewBox } from "@/components/ui/OverviewBox";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertCircle, Shuffle } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { ImageOff } from "lucide-react";
import { SpoilerText } from "@/components/ui/SpoilerText";
import { WatchLaterButton } from "@/components/WatchLaterButton";
import { useSession } from "@/hooks/useSession";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MovieCardSkeleton } from "@/components/ui/MovieCardSkeleton";
import { AuthBar } from "@/components/ui/AuthBar";
import { authFetch } from "@/lib/api";
import { WatchLaterList } from "@/components/WatchLaterList";
interface MovieResponse
{
    title: string;
    overview: string;
    date: string;
    poster_path: string | null;
    id: number;
}

export default function App() {

  const [movie, setMovie] = useState<MovieResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);  
  const session = useSession();
  const [view, setView] = useState<"pick" | "list">("pick");
  async function fetchRandomMovie() {
    setIsLoading(true);
    setError(null); // Reset error state before fetching
    try {

      const response = await authFetch("/api/random");
 
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data: MovieResponse = await response.json();
 
      
      setMovie(data);
    } catch (error) {
      console.error("Failed to fetch movie:", error);
      setError("Failed to fetch movie. Please try again.");

    } finally {
      setIsLoading(false);
    }
  }
 

  return (
    <main className="flex min-h-svh flex-col items-center gap-8 px-4 py-12">
      <header className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-4xl font-bold tracking-tight">DecideAlready</h1>
        <p className="text-muted-foreground">You can't pick a film? Let the button decide.</p>
        <AuthBar />
        {session && (
          <div className="flex gap-2">
            <Button
              variant={view === "pick" ? "default" : "outline"}
              size="sm"
              aria-pressed={view === "pick"}
              onClick={() => setView("pick")}
            >
              Pick a film
            </Button>
            <Button
              variant={view === "list" ? "default" : "outline"}
              size="sm"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              Watch later
            </Button>
          </div>
        )}
      </header>

      {session && view === "list" ? (
                <WatchLaterList />
      ) : (
        <>
          <Button size="lg" onClick={fetchRandomMovie} disabled={isLoading}>
            {isLoading ? <Spinner data-icon="inline-start" /> : <Shuffle data-icon="inline-start" />}
            {isLoading ? "Picking..." : "Pick a film"}
          </Button>

          {isLoading ? (
            <MovieCardSkeleton />
          ) : error ? (
            <Alert variant="destructive" className="w-full max-w-sm">
              <AlertCircle />
              <AlertTitle>Something went wrong</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : movie ? (
            <Card className="w-full max-w-sm">
              {movie.poster_path ? (
                <img
                  src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
                  alt={`Poster for ${movie.title}`}
                  className="aspect-2/3 w-full object-cover"
                />
              ) : (
                <div className="-mt-(--card-spacing) flex aspect-2/3 w-full flex-col items-center justify-center gap-2 bg-muted text-muted-foreground">
                  <ImageOff />
                  <span className="text-sm">No poster available</span>
                </div>
              )}

              <CardHeader>
                <CardTitle className="text-xl">{movie.title}</CardTitle>
                {movie.date && (
                  <CardAction>
                    <Badge variant="secondary">{movie.date.slice(0, 4)}</Badge>
                  </CardAction>
                )}
              </CardHeader>

              <CardContent className="flex flex-col gap-4">
                <OverviewBox key={movie.id} movieId={movie.id} />
                {movie.overview && <SpoilerText key={movie.id} text={movie.overview} />}
              </CardContent>

              {session && (
                <CardFooter>
                  <WatchLaterButton key={movie.id} tmdbId={movie.id} />
                </CardFooter>
              )}
            </Card>
          ) : null}
        </>
      )}
    </main>
  );
}