import { AsyncLocalStorage } from "node:async_hooks";

export interface SessionCredentials {
  msalAccountId: string; // MSAL AccountInfo.homeAccountId
}

export const sessionStore = new AsyncLocalStorage<SessionCredentials>();
