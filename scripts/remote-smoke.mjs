const target = process.env.WGUI_SMOKE_URL ||
  "https://wgui.wandersguide.site/phase1/campaign/23/encounters/40";

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 15000);

try {
  const response = await fetch(target, {
    method: "GET",
    redirect: "manual",
    signal: controller.signal,
    headers: {
      "User-Agent": "Wanderers-Owlbear-Extension-CI/0.1"
    }
  });

  console.log(`WGUI smoke: ${response.status} ${response.statusText} - ${target}`);

  if (response.status >= 500) {
    throw new Error(`WGUI returned server error ${response.status}`);
  }
} finally {
  clearTimeout(timer);
}
