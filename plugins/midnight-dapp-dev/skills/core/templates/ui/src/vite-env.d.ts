/// <reference types="vite/client" />

import type {} from "@midnightntwrk/dapp-connector-api";

declare global {
  interface ImportMetaEnv {
    /** The network to ask the wallet for. Defaults to "undeployed" (local devnet). */
    readonly VITE_NETWORK_ID?: string;
  }
}

// `window.midnight` is typed by @midnightntwrk/dapp-connector-api itself: 4.1.0
// declares a global `var midnight` holding the installed wallets, each under
// its own key (Lace also aliases itself as `mnLace`), so no redeclaration here.

