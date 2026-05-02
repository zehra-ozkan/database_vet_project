export type AppRole = "owner" | "vet" | "manager";

export interface StoredUser {
  id?: number;
  name?: string;
  email?: string;
  role?: string;
}

const ROLE_ALIASES: Record<string, AppRole> = {
  owner: "owner",
  petowner: "owner",
  vet: "vet",
  veterinarian: "vet",
  manager: "manager",
  clinicmanager: "manager",
  clinic_manager: "manager",
};

export function normalizeRole(role: unknown): AppRole | null {
  if (typeof role !== "string") return null;

  const key = role.trim().replace(/[\s-]/g, "_").toLowerCase();
  return ROLE_ALIASES[key] ?? null;
}

export function normalizeStoredUser(user: unknown): StoredUser | null {
  if (!user || typeof user !== "object") return null;

  const storedUser = user as StoredUser;
  const role = normalizeRole(storedUser.role);
  if (!role) return null;

  return {
    ...storedUser,
    role: role === "manager" ? "manager" : storedUser.role,
  };
}

export function getStoredUser(): StoredUser | null {
  if (typeof window === "undefined") return null;

  const savedUser = localStorage.getItem("user");
  if (!savedUser) return null;

  try {
    return normalizeStoredUser(JSON.parse(savedUser));
  } catch {
    return null;
  }
}

export function isManager(user: unknown) {
  return normalizeRole((user as StoredUser | null | undefined)?.role) === "manager";
}
