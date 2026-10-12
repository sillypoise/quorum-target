import { useCallback, useEffect, useRef, useState } from "react";
import type { Book } from "./library.ts";
import { searchBooks } from "./openlibrary.ts";

export type SearchState =
  | { status: "idle" | "loading"; books: Book[]; error: null }
  | { status: "done"; books: Book[]; error: null }
  | { status: "failed"; books: Book[]; error: string };

const FAILURE_MESSAGES = {
  network: "Could not reach Open Library. Check your connection, then search again.",
  status: "Open Library could not run the search. Try again in a moment.",
  malformed: "Open Library sent a reply this page cannot read. Try the search again.",
  timeout: "The search timed out after 8 seconds. Search again.",
} as const;

// Owns the request lifecycle: one AbortController per search, latest wins, abort on unmount.
export function useBookSearch() {
  const [state, setState] = useState<SearchState>({ status: "idle", books: [], error: null });
  const current = useRef<AbortController | null>(null);

  useEffect(() => () => current.current?.abort(), []);

  const search = useCallback((query: string) => {
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    setState({ status: "loading", books: [], error: null });
    void searchBooks(query, controller.signal).then((result) => {
      // A superseded or unmounted search changes nothing, even if its response arrived anyway.
      if (current.current !== controller || controller.signal.aborted) return;
      if (result.kind === "ok") setState({ status: "done", books: result.books, error: null });
      else if (result.kind === "failed") {
        setState({ status: "failed", books: [], error: FAILURE_MESSAGES[result.reason] });
      }
    });
  }, []);

  return { ...state, search };
}
