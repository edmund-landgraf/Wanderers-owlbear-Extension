import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const required = [
  "dist/index.html",
  "dist/manifest.json",
  "dist/wanderers-mark.svg"
];

for (const file of required) {
  if (!existsSync(file)) {
    throw new Error(`Missing production artifact: ${file}`);
  }
}

const manifest = JSON.parse(readFileSync("dist/manifest.json", "utf8"));
for (const asset of [manifest.icon, manifest.action?.icon]) {
  if (!asset || !existsSync(`dist${asset}`)) {
    throw new Error(`Manifest references missing production asset: ${asset}`);
  }
}

const files = walk("dist");
const textFiles = files.filter((file) => /\.(?:html|js|css|json|svg|txt|map)$/i.test(file));
const bundleText = textFiles.map((file) => readFileSync(file, "utf8")).join("\n");

for (const forbidden of [
  "VITE_WGUI_BEARER_TOKEN",
  "Authorization: Bearer",
  "SUPABASE_SERVICE_ROLE_KEY",
  "BEGIN PRIVATE KEY"
]) {
  if (bundleText.includes(forbidden)) {
    throw new Error(`Forbidden secret/configuration marker found in production bundle: ${forbidden}`);
  }
}

const index = readFileSync("dist/index.html", "utf8");
if (!index.includes('id="root"')) {
  throw new Error("Production index.html is missing the React root element.");
}

console.log(`dist smoke: ${files.length} files; manifest and referenced assets present; no forbidden secret markers`);
