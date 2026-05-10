import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = path.join(root, "build", "index.html");

let html = fs.readFileSync(htmlPath, "utf8");
html = html.replaceAll('="/_app/', '="./_app/');
html = html.replaceAll('import("/_app/', 'import("./_app/');
html = html.replaceAll("import('/_app/", "import('./_app/");
fs.writeFileSync(htmlPath, html);
