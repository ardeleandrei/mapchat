export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) { super(message); this.status = status; }
}

export async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch("/api" + path, {
      method, credentials: "same-origin", signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(method === "GET" ? {} : { "X-Wolfchatter-Request": "1" }),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    if (!response.ok) throw new ApiError(response.status, data.error || "Request failed");
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new Error(error instanceof DOMException && error.name === "AbortError"
      ? "The request timed out. You can retry safely."
      : "Cannot reach Wolfchatter. Check your connection and try again.");
  } finally { window.clearTimeout(timeout); }
}
