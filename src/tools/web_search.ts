import { LRUCache } from "lru-cache";
import { default as PQueue } from "p-queue";
import { searxSearch } from "../searx.js";

// Small in-memory cache & throttle
const searchCache = new LRUCache<string, any[]>({
  max: 500,
  ttl: 10 * 60 * 1000,
}); // 10 min
const searchQueue = new PQueue({ intervalCap: 4, interval: 2000 }); // ≈2 QPS with small bursts

export const web_search = () => ({
  name: "web_search",
  description:
    "Developer-focused web search via public SearXNG instances (JSON).",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: 'Search query, e.g. "zod refine example site:github.com"',
      },
      topK: {
        type: "number",
        description: "Max results to return (1–20)",
      },
      language: {
        type: "string",
        description: '2-letter language code, e.g. "en", "no"',
      },
      safesearch: {
        type: "number",
        description: "0 off, 1 moderate, 2 strict",
      },
    },
    required: ["query"],
  },
  execute: async (params: {
    query: string;
    topK?: number;
    language?: string;
    safesearch?: number;
  }) => {
    const { query, topK = 8, language = "en", safesearch = 1 } = params;
    const key = `${language}|${safesearch}|${topK}|${query}`;
    const hit = searchCache.get(key);
    if (hit) return hit;

    const data = await searchQueue.add(() =>
      searxSearch({
        query,
        language,
        safesearch: safesearch as 0 | 1 | 2,
        timeoutMs: 8000,
      })
    );

    const results = (data?.results ?? [])
      .slice(0, Math.max(1, Math.min(20, topK)))
      .map((r: any) => ({
        title: r.title ?? "",
        url: r.url ?? r.href ?? "",
        snippet: (r.content ?? r.snippet ?? "").replace(/<[^>]+>/g, ""), // strip HTML
        engine: r.engine ?? "",
      }));

    searchCache.set(key, results);
    return results;
  },
});
