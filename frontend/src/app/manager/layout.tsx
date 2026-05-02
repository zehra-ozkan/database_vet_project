"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/manager/Sidebar";
import { getStoredUser, isManager } from "@/lib/auth";

type AuthState = "loading" | "allowed" | "denied";

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const router = useRouter();

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      startTransition(() => setAuthState("denied"));
      router.push("/login");
      return;
    }

    localStorage.setItem("user", JSON.stringify(user));

    if (isManager(user)) {
      startTransition(() => setAuthState("allowed"));
      return;
    }

    startTransition(() => setAuthState("denied"));
    router.push("/home");
  }, [router]);

  if (authState === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-violet-100 via-emerald-50 to-sky-100">
        <div className="rounded-3xl bg-white/85 px-8 py-6 text-sm font-semibold text-slate-500 shadow-sm">Checking manager access...</div>
      </div>
    );
  }

  if (authState === "denied") return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-100 via-emerald-50 to-sky-100 text-slate-800">
      <Sidebar />
      <main className="mx-auto min-h-screen max-w-7xl px-4 pb-10 pt-6 md:px-8">{children}</main>
    </div>
  );
}
