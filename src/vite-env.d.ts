/// <reference types="vite/client" />

declare global {
  /** Build-time flag from `vite.config.mts` (and `false` in `vitest.config.ts`). */
  const __PSY_MOBILE_SHELL__: boolean;

  interface ImportMetaEnv {
    readonly VITE_PSYSONIC_FLATPAK?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  interface Window {
    __psyHidden?: boolean;
    __psyBlurred?: boolean;
    __psyStartMinimizedToTray?: boolean;
    __psyIsTilingWm?: boolean;
    __psyLifecycleGeneration?: number;
  }
}

export {};
