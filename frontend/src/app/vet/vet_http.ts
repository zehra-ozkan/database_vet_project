export type VetSearchValue = string | string[] | undefined;

export function vetGetSearchValue(value: VetSearchValue): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export function vetParsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

const vetApiBaseCandidates = Array.from(
  new Set(
    [process.env.INTERNAL_API_BASE_URL, "http://backend:5000", "http://localhost:5000"].filter(
      (value): value is string => Boolean(value)
    )
  )
);

function buildErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const errorValue = (payload as { error?: unknown }).error;
    if (typeof errorValue === "string") {
      return errorValue;
    }
  }
  return `HTTP ${status}`;
}

export async function vetFetchJson<T>(
  endpoint: string
): Promise<{ data: T | null; error: string | null }> {
  let lastError = "Data could not be loaded.";

  for (const apiBase of vetApiBaseCandidates) {
    try {
      const response = await fetch(`${apiBase}${endpoint}`, { cache: "no-store" });
      const payload = (await response.json()) as T & { error?: string };
      if (!response.ok) {
        lastError = buildErrorMessage(payload, response.status);
        continue;
      }
      return { data: payload, error: null };
    } catch (error) {
      if (error instanceof Error) {
        lastError = error.message;
      }
    }
  }

  return { data: null, error: lastError };
}
