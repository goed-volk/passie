import Module from "node:module";
import { createRequire } from "node:module";

// Route punycode require calls from bundled dependencies (like wrangler/whatwg-url)
// to userland punycode package to prevent Node DEP0040 deprecation warning.
const req = createRequire(import.meta.url);
const userlandPunycode = req("punycode/punycode.js");

const customModule = Module as unknown as { _load: (request: string, ...args: unknown[]) => unknown };
const origLoad = customModule._load;
customModule._load = function (request: string, ...args: unknown[]) {
  if (request === "punycode" || request === "node:punycode") {
    return userlandPunycode;
  }
  return origLoad.apply(this, [request, ...args]);
};



