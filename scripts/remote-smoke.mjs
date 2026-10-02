const target = process.env.WGUI_SMOKE_URL ||
  "https://wgui.wandersguide.site/phase1/campaign/23/encounters/40";

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 30000);

async function fetchChecked(url, expectedKind) {
  const response = await fetch(url, {
    method: "GET",
    redirect: "follow",
    signal: controller.signal,
    headers: {
      "User-Agent": "Wanderers-Owlbear-Extension-CI/0.1"
    }
  });

  if (!response.ok) {
    throw new Error(`${expectedKind} returned HTTP ${response.status}: ${url}`);
  }

  return response;
}

function assertAssetType(url, contentType) {
  const path = new URL(url).pathname.toLowerCase();
  const type = contentType.toLowerCase();

  if (path.endsWith(".js") && !type.includes("javascript")) {
    throw new Error(`JavaScript asset returned unexpected content type ${contentType}: ${url}`);
  }
  if (path.endsWith(".css") && !type.includes("text/css")) {
    throw new Error(`CSS asset returned unexpected content type ${contentType}: ${url}`);
  }
  if (/\.(?:png|jpe?g|gif|webp|svg|ico)$/.test(path) && !type.includes("image/")) {
    throw new Error(`Image asset returned unexpected content type ${contentType}: ${url}`);
  }
  if (path.endsWith(".webmanifest") && !(type.includes("manifest") || type.includes("json"))) {
    throw new Error(`Web manifest returned unexpected content type ${contentType}: ${url}`);
  }
}

function moduleRefs(source, base) {
  const refs = new Set();
  for (const match of source.matchAll(/(?:from\s*|import\s*\(|import\s*)["']([^"']+\.js)["']/g)) {
    refs.add(new URL(match[1], base).href);
  }
  for (const match of source.matchAll(/["']([^"']+\.js)["']/g)) {
    const ref = match[1];
    if (ref.startsWith("/") || ref.startsWith("./") || ref.startsWith("../") || ref.startsWith("assets/")) {
      refs.add(new URL(ref, base).href);
    }
  }
  return [...refs];
}

function interestingSnippets(source) {
  const needles = [
    "campaign-fights",
    "campaign_pcs",
    "campaign-pcs",
    "ensure-user",
    "attach-by-key",
    "character-file",
    "shared-rolls",
    "functions/v1",
    "encounters"
  ];
  const snippets = [];
  for (const needle of needles) {
    let from = 0;
    while (true) {
      const index = source.indexOf(needle, from);
      if (index < 0) break;
      snippets.push(source.slice(Math.max(0, index - 180), Math.min(source.length, index + needle.length + 220)));
      from = index + needle.length;
      if (snippets.length >= 30) return snippets;
    }
  }
  return snippets;
}

try {
  const response = await fetchChecked(target, "WGUI route");
  console.log(`WGUI smoke: ${response.status} ${response.statusText} - ${response.url}`);

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("text/html")) {
    throw new Error(`WGUI route returned unexpected content type: ${contentType || "(missing)"}`);
  }

  const html = await response.text();
  const documentUrl = new URL(response.url);
  const baseMatch = html.match(/<base\b[^>]+href=["']([^"']+)["']/i);
  const assetBase = baseMatch ? new URL(baseMatch[1], documentUrl) : documentUrl;

  const assetRefs = new Set();
  for (const match of html.matchAll(/<(?:script|link)\b[^>]+(?:src|href)=["']([^"'#?]+)["']/gi)) {
    const ref = match[1];
    if (!ref || ref.startsWith("data:")) continue;
    const url = new URL(ref, assetBase);
    if (url.origin === documentUrl.origin) assetRefs.add(url.href);
  }

  const queue = [...assetRefs].filter((url) => url.endsWith(".js"));
  const seen = new Set();
  let discovered = 0;

  while (queue.length && seen.size < 80) {
    const assetUrl = queue.shift();
    if (!assetUrl || seen.has(assetUrl)) continue;
    seen.add(assetUrl);

    const assetResponse = await fetchChecked(assetUrl, "WGUI JS asset");
    const assetType = assetResponse.headers.get("content-type") || "";
    assertAssetType(assetUrl, assetType);
    const source = await assetResponse.text();
    console.log(`WGUI JS: ${source.length} bytes - ${assetUrl}`);

    for (const snippet of interestingSnippets(source)) {
      console.log("WGUI DISCOVERY:", snippet.replace(/\s+/g, " "));
      discovered += 1;
    }

    for (const ref of moduleRefs(source, assetUrl)) {
      if (new URL(ref).origin === documentUrl.origin && !seen.has(ref)) queue.push(ref);
    }
  }

  console.log(`WGUI discovery checked ${seen.size} JS modules and found ${discovered} interesting snippets`);
} finally {
  clearTimeout(timer);
}
