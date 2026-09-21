/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Game server origin; defaults to http://localhost:9208 when unset. */
  readonly VITE_HOST?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/**
 * Replaced at build time by vite.config.js. True only for `vite build --mode e2e`,
 * which exposes the window.__LOST_TEMPLE_GAME__ hook for the end-to-end harness.
 * Never enable this for a real deployment.
 */
declare const __E2E_HOOK__: boolean
