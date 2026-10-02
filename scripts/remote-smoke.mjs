const target = process.env.WGUI_SMOKE_URL ||
  "https://wgui.wandersguide.site/phase1/campaign/23/encounters/40";

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 20000);

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

try {
  const response = await fetchChecked(target, "WGUI route");
  console.log(`WGUI smoke: ${response.status} ${response.statusText} - ${response.url}`);

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("text/html")) {
    throw new Error(`WGUI route returned unexpected content type: ${contentType || "(missing)"}`);
  }

  const html = await response.text();
  if (!/<(?:div|main)[^>]+id=["']root["']/i.test(html) && !/<script[^>]+type=["']module["']/i.test(html)) {
    throw new Error("WGUI route did not look like a rendered SPA entry document.");
  }

  if (html.length < 200) {
    throw new Error(`WGUI route returned suspiciously small HTML (${html.length} bytes)`);
  }

  const base = new URL(response.url);
  const assetRefs = new Set();
  for (const match of html.matchAll(/<(?:script|link)\b[^>]+(?:src|href)=["']([^"'#?]+)["']/gi)) {
    const ref = match[1];
    if (!ref || ref.startsWith("data:")) continue;
    const url = new URL(ref, base);
    if (url.origin === base.origin) assetRefs.add(url.href);
  }

  const assets = [...assetRefs].slice(0, 12);
  for (const assetUrl of assets) {
    const assetResponse = await fetchChecked(assetUrl, "WGUI asset");
    const assetType = assetResponse.headers.get("content-type") || "";
    const bytes = (await assetResponse.arrayBuffer()).byteLength;
    if (bytes === 0) throw new Error(`WGUI asset was empty: ${assetUrl}`);
    console.log(`WGUI asset: ${assetResponse.status} ${bytes} bytes ${assetType} - ${assetUrl}`);
  }

  console.log(`WGUI smoke body: ${html.length} bytes, content-type ${contentType}, checked ${assets.length} same-origin assets`);
} finally {
  clearTimeout(timer);
}
