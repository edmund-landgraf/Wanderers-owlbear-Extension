export function extractSvgBackgroundColor(svg: string): string | null {
  const colors: string[] = [];

  for (const match of svg.matchAll(/\bfill\s*=\s*["']([^"']+)["']/gi)) {
    colors.push(match[1].trim());
  }
  for (const match of svg.matchAll(/\bfill\s*:\s*([^;}"']+)/gi)) {
    colors.push(match[1].trim());
  }

  const ignored = new Set([
    "none",
    "transparent",
    "white",
    "#fff",
    "#ffffff",
    "rgb(255,255,255)",
    "rgb(255, 255, 255)"
  ]);

  return colors.find((color) => color && !ignored.has(color.toLowerCase())) ?? null;
}

function decodeSvgDataUrl(url: string): string | null {
  const comma = url.indexOf(",");
  if (comma < 0) return null;

  const header = url.slice(0, comma);
  const payload = url.slice(comma + 1);

  try {
    if (/;base64/i.test(header)) {
      return atob(payload);
    }
    return decodeURIComponent(payload);
  } catch {
    return null;
  }
}

export async function readTokenBackgroundColor(
  imageUrl: string,
  mime?: string | null
): Promise<string | null> {
  const isSvg =
    mime?.toLowerCase().includes("svg") ||
    imageUrl.startsWith("data:image/svg+xml") ||
    /\.svg(?:$|[?#])/i.test(imageUrl);

  if (!isSvg) return null;

  if (imageUrl.startsWith("data:image/svg+xml")) {
    const svg = decodeSvgDataUrl(imageUrl);
    return svg ? extractSvgBackgroundColor(svg) : null;
  }

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return null;
    return extractSvgBackgroundColor(await response.text());
  } catch {
    return null;
  }
}
