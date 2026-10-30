import { cpSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const source = path.dirname(require.resolve("pdfjs-dist/package.json"));
const { version } = JSON.parse(
  readFileSync(path.join(source, "package.json"), "utf8"),
);
const target = path.resolve("public/vendor/pdfjs", version);
mkdirSync(target, { recursive: true });
cpSync(
  path.join(source, "build/pdf.worker.min.mjs"),
  path.join(target, "pdf.worker.min.mjs"),
);
for (const directory of ["cmaps", "standard_fonts", "wasm", "iccs"])
  cpSync(path.join(source, directory), path.join(target, directory), {
    recursive: true,
  });
