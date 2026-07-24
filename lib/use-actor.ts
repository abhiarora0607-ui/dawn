// lib/use-actor.ts
// The client half of the actor spine (V60). One /api/actor fetch per page
// LOAD — the promise is cached at module level so the shell, the topbar and
// any page asking "who am I?" in the same render tree share a single answer
// instead of racing three.
//
// Returns undefined while resolving (render skeletons, decide nothing),
// then a stable Actor. Soft navigations reuse the cache.

"use client";

import { useEffect, useState } from "react";
import type { Actor } from "@/lib/nav";

let cached: Promise<Actor> | null = null;

function fetchActor(): Promise<Actor> {
  if (!cached) {
    cached = fetch("/api/actor")
      .then((r) => r.json())
      .then((d) => (d && d.kind ? (d as Actor) : ({ kind: null } as Actor)))
      .catch(() => ({ kind: null } as Actor));
  }
  return cached;
}

export function useActor(): Actor | undefined {
  const [actor, setActor] = useState<Actor | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    fetchActor().then((a) => { if (alive) setActor(a); });
    return () => { alive = false; };
  }, []);
  return actor;
}
