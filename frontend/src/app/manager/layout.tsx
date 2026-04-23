"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/manager/Sidebar";
import type { ManagerUser } from "@/types/manager";

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  const [allowed, setAllowed] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const savedUser = localStorage.getItem("user");
    if (!savedUser) {
      router.push("/login");
      return;
    }

    try {
      const user = JSON.parse(savedUser) as ManagerUser;
      if (user.role === "ClinicManager") {
        startTransition(() => setAllowed(true));
      } else {
        // Non-manager users keep the existing generic destination.
        router.push("/home");
      }
    } catch {
      router.push("/login");
    }
  }, [router]);

  if (!allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-rose-50 via-teal-50 to-amber-50">
        <div className="rounded-3xl bg-white/80 px-8 py-6 text-sm font-semibold text-slate-500 shadow-sm">Checking manager access...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-teal-50 to-amber-50 text-slate-800">
      <div className="lg:flex">
        <Sidebar />
        <main className="min-h-screen flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
