"use client";

import { useEffect, useState } from "react";
import { initialsOf } from "@agency-os/domain";
import { Avatar, AvatarGroup } from "@agency-os/ui";
import type { QuotePresenceRow } from "@agency-os/db";
import { syncQuotePresence } from "@/lib/quote-presence-actions";

const SYNC_INTERVAL_MS = 12_000;
const MAX_VISIBLE = 4;

/** Avatares de quién MÁS tiene esta cotización abierta ahora mismo (con
 * ~12-25s de margen, no instantáneo — ver Docs/40-Technical/Security.md).
 * Se apaga sola (no renderiza nada) si nadie más está. */
export function QuotePresence({ quoteId }: { quoteId: string }) {
  const [others, setOthers] = useState<QuotePresenceRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    const sync = () => {
      syncQuotePresence(quoteId).then((result) => {
        if (!cancelled) setOthers(result);
      });
    };
    sync();
    const interval = setInterval(sync, SYNC_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [quoteId]);

  if (others.length === 0) return null;

  const visible = others.slice(0, MAX_VISIBLE);
  const extra = others.length > MAX_VISIBLE ? others.length - MAX_VISIBLE : undefined;

  return (
    <div className="flex items-center gap-2">
      <AvatarGroup more={extra}>
        {visible.map((person) => (
          <Avatar
            key={person.userId}
            initials={initialsOf(person.fullName)}
            src={person.avatarUrl}
            size="sm"
            online
            title={person.fullName}
          />
        ))}
      </AvatarGroup>
      <span className="text-xs text-muted">
        {others.length === 1 ? "también está aquí" : "también están aquí"}
      </span>
    </div>
  );
}
