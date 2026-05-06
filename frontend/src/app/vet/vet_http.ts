import { cookies } from "next/headers";
import { vetBuildApiErrorMessage, vetBuildClientErrorMessage } from "./vet_error_messages";

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

export async function vetFetchJson<T>(
  endpoint: string
): Promise<{ data: T | null; error: string | null }> {
  let lastError = "Data could not be loaded.";

  for (const apiBase of vetApiBaseCandidates) {
    try {
      const response = await fetch(`${apiBase}${endpoint}`, { cache: "no-store" });
      const payload = (await response.json()) as T & { error?: string };
      if (!response.ok) {
        lastError = vetBuildApiErrorMessage(payload, response.status, "Data could not be loaded.");
        continue;
      }
      return { data: payload, error: null };
    } catch (error) {
      lastError = vetBuildClientErrorMessage(error, "Data could not be loaded.");
    }
  }

  return { data: null, error: lastError };
}

export async function vetGetLoggedInVetId(): Promise<number | null> {
  const cookieStore = await cookies();
  const rawSession = cookieStore.get("session_user")?.value;
  if (!rawSession) {
    return null;
  }

  try {
    const decodedSession = decodeURIComponent(rawSession);
    const parsedUser = JSON.parse(decodedSession) as { id?: unknown; role?: unknown };
    const normalizedRole =
      typeof parsedUser.role === "string" ? parsedUser.role.trim().toLowerCase() : "";

    if (normalizedRole !== "veterinarian" && normalizedRole !== "vet") {
      return null;
    }

    const parsedId =
      typeof parsedUser.id === "number" ? parsedUser.id : Number.parseInt(String(parsedUser.id), 10);

    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      return null;
    }

    return parsedId;
  } catch {
    return null;
  }
}
