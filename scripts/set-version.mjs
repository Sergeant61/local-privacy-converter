#!/usr/bin/env node
/**
 * Sets the version in apps/desktop/package.json from a given argument.
 * Usage: node scripts/set-version.mjs 1.2.3
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+/.test(version)) {
  console.error("Usage: node scripts/set-version.mjs <semver>  (e.g. 1.0.0)");
  process.exit(1);
}

const pkgPath = path.join(__dirname, "..", "apps", "desktop", "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
pkg.version = version;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log(`version → ${version}`);
