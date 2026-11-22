// npm run release -- <version>: the extension for the Chrome Web Store (§7.2),
// with the modules built for that version, as dist/gaffer-extension-<version>.zip.
import path from "node:path";
import { build, MODULE_NAMES } from "./build.js";
import { packExtension } from "./extension.js";

const root = path.join(import.meta.dirname, "..");
const SEMVER = /^\d+\.\d+\.\d+$/;

export function releaseVersion(arg) {
  const version = String(arg || "").replace(/^v/, "");
  if (!SEMVER.test(version)) throw new Error("usage: npm run release -- <version>, for example 1.2.0 or v1.2.0");
  return version;
}

async function main(arg) {
  const version = releaseVersion(arg);
  await build([...MODULE_NAMES, "extension"], version, { version });
  console.log("release " + version + " ready: " + path.relative(root, packExtension()));
}

if (process.argv[1] === import.meta.filename) {
  main(process.argv[2]).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
