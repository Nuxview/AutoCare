import { request } from "./client-cache";

export async function api<T>(
  url: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const response = await request(
    url,
    body === undefined
      ? { cache: "no-store" }
      : {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error?.message ?? "Request failed. Please try again.");
  return data as T;
}
