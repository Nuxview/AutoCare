import { isCancelledError, QueryClient } from "@tanstack/react-query";

type CachedResponse = {
  body: string;
  status: number;
  headers: Record<string, string>;
};
const staleTime = 30_000;
let client: QueryClient | undefined;
let scope: string | undefined;

export function clearApiCache() {
  client?.clear();
  scope = undefined;
}

export function setApiCacheScope(
  userId: string,
  franchiseId: string | null,
  role: string | null,
) {
  // This cache is tab-local. Never retain private responses during server rendering.
  if (typeof window === "undefined") return;
  const next = JSON.stringify([userId, franchiseId, role]);
  if (next !== scope) clearApiCache();
  scope = next;
  client ??= new QueryClient({
    defaultOptions: { queries: { staleTime, gcTime: 60_000, retry: false } },
  });
}

export function primeApiCache(url: string, data: unknown) {
  if (typeof window !== "undefined" && scope)
    client?.setQueryData([scope, "GET", url], {
      body: JSON.stringify(data),
      status: 200,
      headers: { "content-type": "application/json" },
    } satisfies CachedResponse);
}

class UncachedResponse extends Error {
  constructor(readonly response: Response) {
    super("Response cannot be cached");
  }
}

export function resetApiSession() {
  clearApiCache();
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      "autocare-session-changed",
      crypto.randomUUID(),
    );
  } catch {
    /* Storage may be unavailable in a private browsing session. */
  }
}

export async function request(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const path = url.split("?")[0];
  const method = (init?.method ?? "GET").toUpperCase();
  const auth = path.startsWith("/api/auth/");
  // PUT is the existing garage-booking list endpoint, not a write.
  const read =
    method === "GET" || (path === "/api/bookings" && method === "PUT");
  const payment = path.startsWith("/api/payments/");
  const verification =
    path === "/api/payments/paystack/verify" || path === "/api/payments/status";
  const requestScope = scope;
  if (auth) clearApiCache();

  const fetchResponse = async (signal?: AbortSignal) => {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      ...(signal ? { signal } : {}),
    });
    if (
      response.ok &&
      (auth || !read || (verification && response.status === 200))
    ) {
      // Cancel older reads so their results cannot repopulate the cache after a write.
      await client?.invalidateQueries({ refetchType: "none" });
      await client?.cancelQueries({}, { revert: false });
      if (auth) {
        resetApiSession();
      }
    }
    return response;
  };

  if (
    typeof window === "undefined" ||
    !client ||
    !scope ||
    !read ||
    auth ||
    payment ||
    path === "/api/me" ||
    init?.signal
  ) {
    const response = await fetchResponse();
    if (response.status === 401 || response.status === 403) client?.clear();
    return response;
  }
  try {
    const saved = await client.fetchQuery({
      queryKey: [scope, method, url],
      queryFn: async ({ signal }): Promise<CachedResponse> => {
        const response = await fetchResponse(signal);
        if (
          !response.ok ||
          !response.headers.get("content-type")?.includes("application/json")
        )
          throw new UncachedResponse(response);
        return {
          body: await response.text(),
          status: response.status,
          headers: Object.fromEntries(response.headers),
        };
      },
    });
    return new Response(saved.body, {
      status: saved.status,
      headers: saved.headers,
    });
  } catch (error) {
    if (isCancelledError(error)) {
      if (requestScope && requestScope === scope) return request(url, init);
      return Response.json(
        { error: { code: "SESSION_CHANGED", message: "Sign in to continue" } },
        { status: 401 },
      );
    }
    if (error instanceof UncachedResponse) {
      if (error.response.status === 401 || error.response.status === 403)
        client?.clear();
      return error.response.clone();
    }
    throw error;
  }
}
