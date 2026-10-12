const API_ENDPOINT = "https://api.webfetch.io/v1/";
const MAX_RESULTS = 180;
const REQUEST_TIMEOUT_MS = 50_000;

function decodeEscapes(value) {
    return String(value || "")
        .replace(/\\u003d/gi, "=")
        .replace(/\\u0026/gi, "&")
        .replace(/\\u003c/gi, "<")
        .replace(/\\u003e/gi, ">")
        .replace(/\\\//g, "/")
        .replace(/&amp;/gi, "&")
        .replace(/\\x3d/gi, "=")
        .replace(/\\x26/gi, "&");
}

function normalizeImageUrl(value) {
    try {
        const cleaned = decodeEscapes(value).replace(/\\u002[fF]/g, "/").trim();
        const url = new URL(cleaned);
        if (!["http:", "https:"].includes(url.protocol)) return null;

        const host = url.hostname.toLowerCase();
        if (
            host === "google.com" ||
            host.endsWith(".google.com") ||
            host.endsWith(".googleusercontent.com") ||
            host.endsWith(".gstatic.com") ||
            host.endsWith(".googleapis.com") ||
            host === "youtube.com" ||
            host.endsWith(".youtube.com")
        ) return null;

        url.hash = "";
        return url.href;
    } catch {
        return null;
    }
}

function extractImageUrls(html) {
    const source = decodeEscapes(html);
    const found = new Set();

    // Google Images commonly embeds original URLs as murl/ou fields.
    const patterns = [
        /"(?:murl|ou)"\\s*:\\s*"(https?:\\/\\/[^"]+)"/gi,
        /\\["(https?:\\/\\/[^"\\\\]+)",\\s*\\d{2,5},\\s*\\d{2,5}\\]/gi,
        /https?:\\/\\/[^"'\\s<>\\\\]+\\.(?:jpe?g|png|webp|gif|avif|bmp)(?:\\?[^"'\\s<>\\\\]*)?/gi
    ];

    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(source))) {
            const raw = match[1] || match[0];
            const url = normalizeImageUrl(raw);
            if (!url) continue;

            // Ignore obvious page links; keep direct image URLs and image-CDN URLs.
            let parsed;
            try { parsed = new URL(url); } catch { continue; }
            const path = parsed.pathname.toLowerCase();
            const host = parsed.hostname.toLowerCase();
            const hasImageExtension = /\\.(?:jpe?g|png|webp|gif|avif|bmp)$/i.test(path);
            const imageHost = /(?:images?|img|media|photos?|cdn|static|pinimg)/i.test(host);
            if (!hasImageExtension && !imageHost) continue;

            found.add(url);
            if (found.size >= MAX_RESULTS) return [...found];
        }
    }

    return [...found];
}

export async function searchGoogleImagesWebfetch(query, limit = 120) {
    const apiKey = process.env.WEBFETCH_API_KEY || process.env.WEBFETCH_KEY;
    if (!apiKey) {
        console.log("ℹ️ Google Imagens/Webfetch: WEBFETCH_API_KEY não configurada; pulando fonte externa.");
        return [];
    }

    const searchUrl = new URL("https://www.google.com/search");
    searchUrl.searchParams.set("tbm", "isch");
    searchUrl.searchParams.set("hl", "en");
    searchUrl.searchParams.set("safe", "active");
    searchUrl.searchParams.set("q", String(query || "").trim());

    const apiUrl = new URL(API_ENDPOINT);
    apiUrl.searchParams.set("url", searchUrl.href);
    apiUrl.searchParams.set("render_js", "false");
    apiUrl.searchParams.set("return_page_source", "true");
    apiUrl.searchParams.set("timeout", String(REQUEST_TIMEOUT_MS));
    apiUrl.searchParams.set("tag", "chiru-san-pack-google-images");

    try {
        console.log("🌐 Webfetch/Google Imagens:", query);
        const response = await fetch(apiUrl, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                Accept: "text/html,application/json",
                "User-Agent": "chiru-san-bot/1.0"
            },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });

        const body = await response.text();
        if (!response.ok) {
            let detail = body.slice(0, 220);
            try {
                const json = JSON.parse(body);
                detail = json.code || json.error || detail;
            } catch {}
            console.log(`⚠️ Webfetch/Google Imagens HTTP ${response.status}: ${detail}`);
            return [];
        }

        const urls = extractImageUrls(body).slice(0, Math.max(0, Math.min(Number(limit) || 0, MAX_RESULTS)));
        const images = urls.map(url => ({
            url,
            source: "google-images-webfetch",
            animated: /\\.gif(?:[?#]|$)/i.test(url)
        }));

        console.log(`🌐 Webfetch/Google Imagens: ${images.length} URLs candidatas`);
        return images;
    } catch (error) {
        console.log("⚠️ Webfetch/Google Imagens:", error.message);
        return [];
    }
}
