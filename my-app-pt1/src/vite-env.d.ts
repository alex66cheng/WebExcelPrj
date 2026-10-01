/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Path of the ADAuthAPI IIS application, e.g. /WebExcelAuth (default /adauth)
  readonly VITE_AD_AUTH_PATH?: string;
}
