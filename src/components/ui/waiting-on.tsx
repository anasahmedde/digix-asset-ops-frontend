"use client";

import { useEffect, useState } from "react";

import api from "@/lib/api";

interface Desk { id: string; name: string; role: string; since: string }

/** Whose desk something is on. Reads the people still holding the request
 *  filed under `refKey` (the notification ref, e.g. `budget:<project id>`),
 *  so the screen names the approver rather than "awaiting approval". */
export function WaitingOn({ refKey, capability, prefix = "With", className = "" }: { refKey: string; capability?: string; prefix?: string; className?: string }) {
  const [people, setPeople] = useState<Desk[] | null>(null);
  useEffect(() => {
    let live = true;
    api.get("/notifications/notifications/waiting-on/", { params: { ref: refKey } })
      .then(async (r) => {
        // Nothing filed under the ref: the desk is whoever holds the right.
        if (r.data.length === 0 && capability) {
          const fb = await api.get("/notifications/notifications/waiting-on/", { params: { capability } });
          if (live) setPeople(fb.data);
          return;
        }
        if (live) setPeople(r.data);
      })
      .catch(() => { if (live) setPeople([]); });
    return () => { live = false; };
  }, [refKey, capability]);
  if (people === null) return null;
  return (
    <span className={`text-xs text-muted-foreground ${className}`}>
      {prefix}:{" "}
      {people.length === 0 ? (
        <span className="italic">nobody yet</span>
      ) : (
        people.map((p, i) => (
          <span key={p.id}>
            {i > 0 && ", "}
            <span className="font-medium text-foreground">{p.name}</span>
            {p.role && <span className="text-muted-foreground"> ({p.role})</span>}
          </span>
        ))
      )}
    </span>
  );
}
