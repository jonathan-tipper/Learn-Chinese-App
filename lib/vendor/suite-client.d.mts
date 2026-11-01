export type SuiteSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  revision: string;
};

export type SuiteStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};

export class SuiteAuthError extends Error {
  constructor(code: string, message: string);
  code: string;
}

export function safeReturnPath(value: unknown, fallback?: string): string;
export function browserSuiteStore(namespace?: string): SuiteStore;
export function createSuiteClient(config: {
  supabaseUrl: string;
  clientId: string;
  redirectUri: string;
  publishableKey?: string;
  store?: SuiteStore;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  lock?: <T>(name: string, task: () => Promise<T>) => Promise<T>;
}): {
  authorisationUrl(next?: string): Promise<string>;
  complete(callbackUrl: string): Promise<{ next: string; session: SuiteSession }>;
  getSession(): Promise<SuiteSession | null>;
  refresh(): Promise<SuiteSession>;
  accessToken(): Promise<string | null>;
  signOut(options?: { scope?: "local" | "global" }): Promise<void>;
};
