/**
 * Node-only helpers for locating highs.wasm next to the package entry.
 */

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(fileURLToPath(import.meta.url));

export function nodeLocateFile(file: string): string {
  const entry = require.resolve("highs");
  return join(dirname(entry), file);
}
