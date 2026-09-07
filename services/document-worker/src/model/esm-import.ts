// tsc's `module: commonjs` rewrites a literal `await import(specifier)`
// into `await Promise.resolve().then(() => require(specifier))` (verified
// by compiling a test file with this project's tsconfig). That only works
// for an ESM-only package (like @xenova/transformers) because of Node's
// require(esm) feature (20.19+/22.12+) — not a language guarantee, and it
// would break if a future dependency version adds top-level await.
// Building the import() call from a string hides it from tsc's static
// rewrite, guaranteeing a real dynamic import regardless of Node version.
const dynamicImport = new Function('specifier', 'return import(specifier)') as <T = unknown>(
  specifier: string,
) => Promise<T>;

export function importEsm<T = unknown>(specifier: string): Promise<T> {
  return dynamicImport<T>(specifier);
}
