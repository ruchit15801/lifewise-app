import { fetch } from "expo/fetch";
import { QueryClient, QueryFunction } from "@tanstack/react-query";

/**
 * Gets the base URL for the Express API server.
 * Uses EXPO_PUBLIC_DOMAIN if set; otherwise fallback for local dev.
 * On Android emulator use EXPO_PUBLIC_DOMAIN=10.0.2.2:5001 to reach host.
 * On physical device use your computer's IP e.g. 192.168.1.5:5001
 */
export function getApiUrl(): string {
  let host =
    process.env.EXPO_PUBLIC_DOMAIN ||
    process.env.EXPO_PUBLIC_API_URL ||
    "127.0.0.1:5001";

  host = host.replace(/^https?:\/\//, "").split("/")[0];
  const isLocal =
    host.includes("localhost") ||
    host.includes("127.0.0.1") ||
    host.includes("10.0.2.2") ||
    /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(host);
  const url = new URL(isLocal ? `http://${host}` : `https://${host}`);
  return url.href.replace(/\/$/, "");
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown | undefined,
  token?: string | null,
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);
  const headers: Record<string, string> = data ? { "Content-Type": "application/json" } : {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const baseUrl = getApiUrl();
    const url = new URL(queryKey.join("/") as string, baseUrl);

    const res = await fetch(url.toString(), {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
