/**
 * Browser stub for highs.mjs's conditional `import("node:module")`.
 * Never called in the worker (ENVIRONMENT_IS_NODE is false).
 */

export function createRequire(_url?: string): NodeRequire {
  throw new Error("node:module createRequire is unavailable in the browser");
}
