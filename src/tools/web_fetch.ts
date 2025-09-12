import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

export const web_fetch = () => ({
  name: "web_fetch",
  description:
    "Fetch a URL and extract the main text using Mozilla Readability.",
  input_schema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The URL to fetch and extract text from",
      },
      maxBytes: {
        type: "number",
        description: "Max bytes to download (default 5MB)",
      },
      timeoutMs: {
        type: "number",
        description: "Timeout in milliseconds",
      },
    },
    required: ["url"],
  },
  execute: async (params: {
    url: string;
    maxBytes?: number;
    timeoutMs?: number;
  }) => {
    const { url, maxBytes = 5 * 1024 * 1024, timeoutMs = 15000 } = params;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "oss-web-tools/1.0 (+https://example.org)",
        Accept: "*/*",
      },
    }).finally(() => clearTimeout(t));

    const contentType = res.headers.get("content-type") || "";
    const isHtmlLike =
      contentType.includes("html") || contentType.startsWith("text/");
    if (!isHtmlLike) {
      // keep it simple; you can add PDF/markdown handlers later
      return {
        url,
        status: res.status,
        mime: contentType,
        title: "",
        text: "",
        bytes: Number(res.headers.get("content-length") || 0),
        wasTruncated: false,
      };
    }

    // Stream with hard size cap
    const reader = (res.body as ReadableStream<Uint8Array>)?.getReader();
    let received = 0;
    const chunks: Uint8Array[] = [];
    let truncated = false;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > maxBytes) {
          const allowed = value.slice(
            0,
            Math.max(0, maxBytes - (received - value.byteLength))
          );
          chunks.push(allowed);
          truncated = true;
          try {
            controller.abort();
          } catch {}
          break;
        }
        chunks.push(value);
      }
    }
    const html = Buffer.concat(chunks).toString("utf8");

    // Extract with Readability
    const dom = new JSDOM(html, { url });
    const reader2 = new Readability(dom.window.document);
    const article = reader2.parse();

    const title =
      article?.title ??
      dom.window.document.querySelector("title")?.textContent?.trim() ??
      "";

    const text = (article?.textContent ?? "").replace(/\s+\n/g, "\n").trim();

    return {
      url,
      status: res.status,
      mime: contentType,
      title,
      text,
      bytes: Buffer.byteLength(html),
      wasTruncated: truncated,
    };
  },
});
