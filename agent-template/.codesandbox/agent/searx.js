import { setTimeout as delay } from "node:timers/promises";
const DEFAULTS = process.env.SEARX_URLS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) ?? [
    // ✅ You can add/remove endpoints here freely.
    // NOTE: Public instances can change. Keep this list short + configurable.
    "https://searx.be",
    "https://searx.tiekoetter.com",
    "https://searxng.site",
];
const INSTANCES = DEFAULTS.map((base) => ({ base }));
let rr = 0;
async function checkHealth(base, signal) {
    // very cheap GET; success if JSON 200
    const url = `${base.replace(/\/+$/, "")}/search?q=ok&format=json`;
    try {
        const res = await fetch(url, { method: "GET", redirect: "follow", signal });
        return (res.ok &&
            res.headers.get("content-type")?.includes("application/json") === true);
    }
    catch {
        return false;
    }
}
export async function pickSearxBase(opt) {
    const timeoutMs = opt?.timeoutMs ?? 1500;
    // 1) honor single explicit override
    const single = process.env.SEARX_URL?.trim();
    if (single)
        return single.replace(/\/+$/, "");
    // 2) probe current pick first, else round-robin probe
    const start = rr % INSTANCES.length;
    for (let n = 0; n < INSTANCES.length; n++) {
        const i = (start + n) % INSTANCES.length;
        const inst = INSTANCES[i];
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), timeoutMs);
        const ok = await checkHealth(inst.base, ac.signal);
        clearTimeout(t);
        inst.healthy = ok;
        inst.lastChecked = Date.now();
        if (ok) {
            rr = i + 1;
            return inst.base.replace(/\/+$/, "");
        }
    }
    // 3) last resort: use the first one (might be temporarily flaky)
    return INSTANCES[0].base.replace(/\/+$/, "");
}
export async function searxSearch(params) {
    const base = await pickSearxBase();
    const url = new URL(`${base}/search`);
    url.searchParams.set("q", params.query);
    url.searchParams.set("format", "json");
    if (params.language)
        url.searchParams.set("language", params.language);
    url.searchParams.set("safesearch", String(params.safesearch ?? 1));
    // dev-ish focus; you can tweak categories:
    url.searchParams.set("categories", "general"); // or: general,it,science
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), params.timeoutMs ?? 8000);
    try {
        const res = await fetch(url, {
            headers: { Accept: "application/json" },
            signal: controller.signal,
        });
        if (!res.ok)
            throw new Error(`SearXNG HTTP ${res.status}`);
        return (await res.json());
    }
    catch (e) {
        // simple backoff + one retry on next instance
        await delay(200 + Math.random() * 400);
        const alt = await pickSearxBase();
        if (alt !== base) {
            const u2 = new URL(`${alt}/search`);
            for (const [key, value] of url.searchParams) {
                u2.searchParams.set(key, value);
            }
            const r2 = await fetch(u2, {
                headers: { Accept: "application/json" },
                signal: controller.signal,
            });
            if (!r2.ok)
                throw new Error(`SearXNG retry HTTP ${r2.status}`);
            return (await r2.json());
        }
        throw e;
    }
    finally {
        clearTimeout(t);
    }
}
