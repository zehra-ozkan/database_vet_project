"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type PetOwnerUser = {
  role?: string;
};

export default function PetOwnerLayout({ children }: { children: React.ReactNode }) {
  const [allowed, setAllowed] = useState(false);
  const router = useRouter();

  useEffect(() => {
    document.body.classList.add("pet-owner");
    const savedUser = localStorage.getItem("user");
    if (!savedUser) {
      router.push("/login");
      return;
    }

    try {
      const user = JSON.parse(savedUser) as PetOwnerUser;
      if (user.role === "PetOwner") {
        startTransition(() => setAllowed(true));
      } else {
        router.push("/home");
      }
    } catch {
      router.push("/login");
    }

    return () => {
      document.body.classList.remove("pet-owner");
    };
  }, [router]);

  if (!allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-rose-50 via-teal-50 to-amber-50">
        <div className="rounded-3xl bg-white/80 px-8 py-6 text-sm font-semibold text-slate-500 shadow-sm">Checking pet owner access...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <main className="min-h-screen">{children}</main>
    </div>
  );
}
