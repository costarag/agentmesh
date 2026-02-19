"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Option = {
  id: string;
  name: string;
};

interface SessionsFiltersProps {
  sourceTools: Option[];
  models: Array<{ key: string; label: string }>;
  initialSearch?: string;
  initialSourceToolId?: string;
  initialModelKey?: string;
  initialFrom?: string;
  initialTo?: string;
}

const SEARCH_MIN_CHARS = 2;
const SEARCH_DEBOUNCE_MS = 350;

function normalizeQueryString(query: string) {
  const params = new URLSearchParams(query);
  const pairs = [...params.entries()].sort(
    ([leftKey, leftValue], [rightKey, rightValue]) => {
      if (leftKey === rightKey) {
        return leftValue.localeCompare(rightValue);
      }
      return leftKey.localeCompare(rightKey);
    },
  );

  const normalized = new URLSearchParams();
  for (const [key, value] of pairs) {
    normalized.append(key, value);
  }

  return normalized.toString();
}

export function SessionsFilters({
  sourceTools,
  models,
  initialSearch,
  initialSourceToolId,
  initialModelKey,
  initialFrom,
  initialTo,
}: SessionsFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(initialSearch ?? "");
  const [sourceToolId, setSourceToolId] = useState(initialSourceToolId ?? "");
  const [modelKey, setModelKey] = useState(initialModelKey ?? "");
  const [from, setFrom] = useState(initialFrom ?? "");
  const [to, setTo] = useState(initialTo ?? "");

  const baseParams = useMemo(
    () => new URLSearchParams(searchParams.toString()),
    [searchParams],
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      const next = new URLSearchParams(baseParams.toString());

      const trimmedSearch = search.trim();
      if (trimmedSearch.length >= SEARCH_MIN_CHARS) {
        next.set("search", trimmedSearch);
      } else {
        next.delete("search");
      }

      if (sourceToolId) {
        next.set("sourceToolId", sourceToolId);
      } else {
        next.delete("sourceToolId");
      }

      if (modelKey) {
        next.set("modelKey", modelKey);
      } else {
        next.delete("modelKey");
      }

      if (from) {
        next.set("from", from);
      } else {
        next.delete("from");
      }

      if (to) {
        next.set("to", to);
      } else {
        next.delete("to");
      }

      next.delete("page");

      const currentQuery = searchParams.toString();
      const nextQuery = next.toString();
      if (
        normalizeQueryString(nextQuery) === normalizeQueryString(currentQuery)
      ) {
        return;
      }

      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [
    baseParams,
    from,
    modelKey,
    pathname,
    router,
    search,
    searchParams,
    sourceToolId,
    to,
  ]);

  return (
    <section className="grid gap-3 rounded-xl border p-3 md:grid-cols-6">
      <div className="md:col-span-2">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search sessions (min 2 chars)"
          className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
        />
      </div>
      <div>
        <select
          value={sourceToolId}
          onChange={(event) => setSourceToolId(event.target.value)}
          className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
        >
          <option value="">All tools</option>
          {sourceTools.map((tool) => (
            <option key={tool.id} value={tool.id}>
              {tool.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <select
          value={modelKey}
          onChange={(event) => setModelKey(event.target.value)}
          className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
        >
          <option value="">All models</option>
          {models.map((model) => (
            <option key={model.key} value={model.key}>
              {model.label}
            </option>
          ))}
        </select>
      </div>
      <input
        type="date"
        value={from}
        onChange={(event) => setFrom(event.target.value)}
        className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
      />
      <input
        type="date"
        value={to}
        onChange={(event) => setTo(event.target.value)}
        className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
      />
    </section>
  );
}
