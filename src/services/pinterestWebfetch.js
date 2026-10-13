const API_ENDPOINT = "https://api.webfetch.io/v1/";
const MAX_RESULTS = 180;
const REQUEST_TIMEOUT_MS = 50_000;

function decodeEscapes(value) {
    return String(value || "")
        .replace(/\\u003d/gi, "=")
        .replace(/\\u0026/gi, "&")
        .replace(/\\u003c/gi, "<")
        .replace(/\\u003e/gi, ">")
        .replace(/\\u002f/gi, "/")
        .replace(/\\\//g, "/")
        .replace(/&amp;/gi, "&")
        .replace(/\\x3d/gi, "=")
        .replace(/\\x26/gi, "&");
}

function normalizeImageUrl(value) {
    try {
        const cleaned = decodeEscapes(value).trim().replace(/^["']|["']$/g, "");
        const url = new URL(cleaned);
        if (!["http:", "https:"].includes(url.protocol)) return null;

        const host = url.hostname.toLowerCase();
        if (
            host !== "i.pinimg.com" &&
            !host.endsWith(".pinimg.com")
        ) return null;

        if (!/\.(?:jpe?g|png|webp|gif|avif|bmp)$/i.test(url.pathname)) return null;
        url.hash = "";
        return url.href;
    } catch {
        return null;
    }
}

function extractPinterestImageUrls(html) {
    const source = decodeEscapes(html);
    const found = new Set();

    // Pinterest embeds image URLs in rendered HTML and JSON payloads.
    const patterns = [
        /https?:\/\/i\.pinimg\.com\/[^"'\s<>\\]+/gi,
        /https?:\\\/\\\/i\.pinimg\.com\\\/[^"'\s<>]+/gi,
        /["'](?:url|image|src)["']\s*:\s*["'](https?:[^"']*pinimg\.com[^"']+)["']/gi
    ];

    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(source))) {
            const raw = (match[1] || match[0])
                .replace(/\\u002f/gi, "/")
                .replace(/\\\//g, "/")
                .replace(/\\u003d/gi, "=")
                .replace(/&amp;/gi, "&")
                .replace(/[),;]+$/g, "");

            const url = normalizeImageUrl(raw);
            if (!url) continue;

            found.add(url);
            if (found.size >= MAX_RESULTS) return [...found];
        }
    }

    // Prefer original-size images when present, but keep other Pinterest image sizes
    // as a fallback so the cloud source can still fill gaps.
    const urls = [...found];
    const originals = urls.filter(url => new URL(url).pathname.includes("/originals/"));
    return originals.length >= 10 ? originals : urls;
}

export async function searchPinterestWebfetch(query, limit = 120) {
    const apiKey = process.env.WEBFETCH_API_KEY || process.env.WEBFETCH_KEY;
    if (!apiKey) {
        console.log("ℹ️ Pinterest/Webfetch: WEBFETCH_API_KEY não configurada; pulando fonte da nuvem.");
        return [];
    }

    const searchUrl = new URL("https://www.pinterest.com/search/pins/");
    searchUrl.searchParams.set("q", String(query || "").trim());

    const apiUrl = new URL(API_ENDPOINT);
    apiUrl.searchParams.set("url", searchUrl.href);
    apiUrl.searchParams.set("mode", "auto");
    apiUrl.searchParams.set("max_cost", "25");
    apiUrl.searchParams.set("timeout", String(REQUEST_TIMEOUT_MS));
    apiUrl.searchParams.set("tag", "chiru-san-pack-pinterest");

    try {
        console.log("🌐 Webfetch/Pinterest:", query);
        const response = await fetch(apiUrl, {
            method: "GET",
            headers: {
                Authorization: "Bearer " + apiKey,
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
            console.log("⚠️ Webfetch/Pinterest HTTP " + response.status + ": " + detail);
            return [];
        }

        const safeLimit = Math.max(0, Math.min(Number(limit) || 0, MAX_RESULTS));
        const urls = extractPinterestImageUrls(body).slice(0, safeLimit);
        const images = urls.map(url => ({
            url,
            source: "pinterest-webfetch",
            animated: /\.gif(?:[?#]|$)/i.test(url)
        }));

        console.log("🌐 Webfetch/Pinterest: " + images.length + " URLs candidatas");
        return images;
    } catch (error) {
        console.log("⚠️ Webfetch/Pinterest:", error.message);
        return [];
    }
}
