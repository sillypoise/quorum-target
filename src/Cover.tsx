import { useState } from "react";
import { coverUrl } from "./openlibrary.ts";

// Remembers the id that failed, so a reused instance given another book's cover tries it afresh.
export function Cover({ id }: { id: number | undefined }) {
  const [failedId, setFailedId] = useState<number | null>(null);
  if (id === undefined || id === failedId) return null;
  return (
    <img
      className="cover"
      src={coverUrl(id)}
      alt=""
      loading="lazy"
      onError={() => setFailedId(id)}
    />
  );
}
