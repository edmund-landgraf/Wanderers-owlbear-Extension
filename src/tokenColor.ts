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

function isSvgImage(imageUrl: string, mime?: string | null): boolean {
  return Boolean(
    mime?.toLowerCase().includes("svg") ||
    imageUrl.startsWith("data:image/svg+xml") ||
    /\.svg(?:$|[?#])/i.test(imageUrl)
  );
}

type ColorBucket = { count: number; r: number; g: number; b: number; saturation: number };

function saturation(red: number, green: number, blue: number) {
  return Math.max(red, green, blue) - Math.min(red, green, blue);
}

function ignoredColor(red: number, green: number, blue: number) {
  return (red > 235 && green > 235 && blue > 235) || (red < 28 && green < 28 && blue < 28);
}

/** Dark brown bezel and gray outline around the colored disc. */
function bezelColor(red: number, green: number, blue: number) {
  if (ignoredColor(red, green, blue)) return true;
  const vividness = saturation(red, green, blue);
  const brightest = Math.max(red, green, blue);
  return (brightest < 100 && vividness < 100) || vividness < 42;
}

function rememberPixel(buckets: Map<string, ColorBucket>, red: number, green: number, blue: number) {
  const key = `${red >> 4},${green >> 4},${blue >> 4}`;
  const vividness = saturation(red, green, blue);
  const bucket = buckets.get(key);
  if (!bucket) {
    buckets.set(key, { count: 1, r: red, g: green, b: blue, saturation: vividness });
    return;
  }
  bucket.count += 1;
  if (vividness > bucket.saturation) {
    bucket.r = red;
    bucket.g = green;
    bucket.b = blue;
    bucket.saturation = vividness;
  }
}

function colorFromBuckets(buckets: Map<string, ColorBucket>): string | null {
  let best: ColorBucket | null = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.count > best.count) best = bucket;
  }
  if (!best) return null;

  const channel = (value: number) => value.toString(16).padStart(2, "0");
  return `#${channel(best.r)}${channel(best.g)}${channel(best.b)}`;
}

/**
 * Disc color inside the dark bezel. Rays walk inward and skip the brown rim,
 * white letter, and gray outline.
 */
export function dominantColorFromPixels(pixels: Uint8ClampedArray, width = 0): string | null {
  const count = pixels.length / 4;
  const height = width > 0 ? Math.floor(count / width) : 0;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let index = 0; index < count; index += 1) {
    if (pixels[index * 4 + 3] < 128 || width <= 0) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const radius = Math.max(maxX - minX, maxY - minY) / 2;
  const ringBuckets = new Map<string, ColorBucket>();

  if (radius > 2) {
    const rays = 48;
    for (let ray = 0; ray < rays; ray += 1) {
      const angle = (ray / rays) * Math.PI * 2;
      const stepX = Math.cos(angle);
      const stepY = Math.sin(angle);
      for (let distance = radius + 1; distance >= radius * 0.45; distance -= 0.5) {
        const x = Math.round(centerX + stepX * distance);
        const y = Math.round(centerY + stepY * distance);
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const offset = (y * width + x) * 4;
        if (pixels[offset + 3] < 128) continue;
        const red = pixels[offset];
        const green = pixels[offset + 1];
        const blue = pixels[offset + 2];
        if (bezelColor(red, green, blue)) continue;
        rememberPixel(ringBuckets, red, green, blue);
        break;
      }
    }
  }

  const ringCount = [...ringBuckets.values()].reduce((sum, bucket) => sum + bucket.count, 0);
  if (ringCount >= 6) return colorFromBuckets(ringBuckets);

  const allBuckets = new Map<string, ColorBucket>();
  for (let index = 0; index < count; index += 1) {
    if (pixels[index * 4 + 3] < 128) continue;
    const red = pixels[index * 4];
    const green = pixels[index * 4 + 1];
    const blue = pixels[index * 4 + 2];
    if (ignoredColor(red, green, blue)) continue;
    rememberPixel(allBuckets, red, green, blue);
  }
  return colorFromBuckets(allBuckets);
}

function sampleRasterColor(imageUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    const finish = (color: string | null) => resolve(color);
    image.onload = () => {
      try {
        const scale = Math.min(1, 160 / Math.max(image.naturalWidth, image.naturalHeight, 1));
        const size = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return finish(null);
        context.imageSmoothingEnabled = false;
        context.drawImage(image, 0, 0, size, height);
        finish(dominantColorFromPixels(context.getImageData(0, 0, size, height).data, size));
      } catch {
        finish(null);
      }
    };
    image.onerror = () => finish(null);
    image.src = imageUrl;
  });
}

export async function readTokenBackgroundColor(
  imageUrl: string,
  mime?: string | null
): Promise<string | null> {
  if (isSvgImage(imageUrl, mime)) {
    if (imageUrl.startsWith("data:image/svg+xml")) {
      const svg = decodeSvgDataUrl(imageUrl);
      const fill = svg ? extractSvgBackgroundColor(svg) : null;
      if (fill) return fill;
    } else {
      try {
        const response = await fetch(imageUrl);
        if (response.ok) {
          const fill = extractSvgBackgroundColor(await response.text());
          if (fill) return fill;
        }
      } catch {
        // Fall through and sample the rendered image.
      }
    }
  }

  return sampleRasterColor(imageUrl);
}
