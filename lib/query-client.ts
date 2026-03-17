import { fetch } from "expo/fetch";
import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { Platform } from "react-native";
import Constants from "expo-constants";
let preferredApiBaseUrl: string | null = null;

/**
 * Gets the base URL for the Express API server.
 * Uses EXPO_PUBLIC_DOMAIN if set; otherwise fallback for local dev.
 * On Android emulator use EXPO_PUBLIC_DOMAIN=10.0.2.2:5000 to reach host.
 * On physical device use your computer's IP e.g. 192.168.1.5:5000
 */
export function getApiUrl(): string {
  let host =
    process.env.EXPO_PUBLIC_DOMAIN ||
    process.env.EXPO_PUBLIC_API_URL ||
    "127.0.0.1:5000";

  host = host.replace(/^https?:\/\//, "").split("/")[0];
  // Android emulator cannot reach host localhost directly.
  if (Platform.OS === "android") {
    host = host.replace("localhost", "10.0.2.2").replace("127.0.0.1", "10.0.2.2");
  }
  const isLocal =
    host.includes("localhost") ||
    host.includes("127.0.0.1") ||
    host.includes("10.0.2.2") ||
    /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(host);
  const url = new URL(isLocal ? `http://${host}` : `https://${host}`);
  return url.href.replace(/\/$/, "");
}

function getExpoDevHost(): string | null {
  const c = Constants as unknown as {
    expoConfig?: { hostUri?: string };
    manifest2?: { extra?: { expoClient?: { hostUri?: string } } };
    manifest?: { debuggerHost?: string; hostUri?: string };
  };
  const hostUri =
    c.expoConfig?.hostUri ||
    c.manifest2?.extra?.expoClient?.hostUri ||
    c.manifest?.debuggerHost ||
    c.manifest?.hostUri;
  if (!hostUri || typeof hostUri !== "string") return null;
  return hostUri.replace(/^https?:\/\//, "").split("/")[0] || null;
}

function getFallbackApiUrl(baseUrl: string): string | null {
  if (Platform.OS !== "android") return null;
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return null;
  }

  const hostname = parsed.hostname;
  if (hostname !== "10.0.2.2" && hostname !== "127.0.0.1" && hostname !== "localhost") {
    return null;
  }

  const devHost = getExpoDevHost();
  if (!devHost) return null;

  const lanIp = devHost.split(":")[0];
  if (!lanIp || lanIp === "localhost" || lanIp === "127.0.0.1") return null;

  parsed.hostname = lanIp;
  return parsed.href.replace(/\/$/, "");
}

function isAndroidLoopbackBaseUrl(baseUrl: string): boolean {
  try {
    const parsed = new URL(baseUrl);
    return parsed.hostname === "10.0.2.2" || parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  } catch {
    return false;
  }
}

function getBaseUrlCandidates(): string[] {
  const baseUrl = getApiUrl();
  const fallbackBaseUrl = getFallbackApiUrl(baseUrl);
  const candidates: string[] = [];

  if (preferredApiBaseUrl) {
    candidates.push(preferredApiBaseUrl);
  }

  // On Android devices, prefer LAN fallback before emulator loopback when available.
  if (fallbackBaseUrl && isAndroidLoopbackBaseUrl(baseUrl)) {
    candidates.push(fallbackBaseUrl, baseUrl);
  } else {
    candidates.push(baseUrl);
    if (fallbackBaseUrl) candidates.push(fallbackBaseUrl);
  }

  return [...new Set(candidates.filter(Boolean))];
}

export function getApiBaseCandidates(): string[] {
  return getBaseUrlCandidates();
}

async function fetchWithApiBaseFallback(route: string, init: RequestInit): Promise<Response> {
  const candidates = getBaseUrlCandidates();
  let lastError: unknown = null;

  for (const baseUrl of candidates) {
    try {
      const url = new URL(route, baseUrl);
      const res = await fetch(url.toString(), init);
      preferredApiBaseUrl = baseUrl;
      return res;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Network request failed");
}

export async function apiRawRequest(route: string, init: RequestInit): Promise<Response> {
  return fetchWithApiBaseFallback(route, init);
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
  const headers: Record<string, string> = data ? { "Content-Type": "application/json" } : {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetchWithApiBaseFallback(route, {
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
    const route = queryKey.join("/") as string;
    const res = await fetchWithApiBaseFallback(route, {
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
