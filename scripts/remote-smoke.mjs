const target = process.env.WGUI_SMOKE_URL ||
  "https://wgui.wandersguide.site/phase1/campaign/23/encounters/40";

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 15000);

try {
  const response = await fetch(target, {
    method: "GET",
    redirect: "follow",
    signal: controller.signal,
    headers: {
      "User-Agent": "Wanderers-Owlbear-Extension-CI/0.1"
    }
  });

  console.log(`WGUI smoke: ${response.status} ${response.statusText} - ${response.url}`);

  if (!response.ok) {
    throw new Error(`WGUI returned HTTP ${response.status}`);
  }

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

  console.log(`WGUI smoke body: ${html.length} bytes, content-type ${contentType}`);
} finally {
  clearTimeout(timer);
}
