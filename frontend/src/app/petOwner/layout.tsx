"use client";

import { startTransition, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

type PetOwnerUser = {
  name?: string;
  role?: string;
};

export default function PetOwnerLayout({ children }: { children: React.ReactNode }) {
  const [allowed, setAllowed] = useState(false);
  const [ownerInitials, setOwnerInitials] = useState("PO");
  const pathname = usePathname();
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
        setOwnerInitials(getInitials(user.name));
        startTransition(() => setAllowed(true));
      } else {
        router.push("/login");
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

  const handleLogout = () => {
    localStorage.removeItem("user");
    document.cookie = "session_user=; path=/; max-age=0; samesite=lax";
    router.push("/login");
  };

  return (
    <div className="pet-owner">
      <div className="container">
        <header className="header-split">
          <div className="header-left">
            <Link href="/petOwner/dashboard" className="brand brand-icon" aria-label="VetChain home">
              <div className="mark" />
            </Link>
          </div>
          <div className="header-right">
            <nav className="nav nav-right">
              <Link href="/petOwner/dashboard" className={pathname === "/petOwner/dashboard" ? "active" : undefined}>
                Dashboard
              </Link>
              <Link href="/petOwner/book" className={pathname === "/petOwner/book" ? "active" : undefined}>
                Book
              </Link>
              <Link href="/petOwner/appointments" className={pathname === "/petOwner/appointments" ? "active" : undefined}>
                Appointments
              </Link>
              <Link href="/petOwner/lost-found" className={pathname === "/petOwner/lost-found" ? "active" : undefined}>
                Lost &amp; Found
              </Link>
            </nav>
            <div className="header-actions">
              <details className="profile-dropdown">
                <summary className="profile-trigger">{ownerInitials}</summary>
                <div className="profile-menu">
                  <Link href="/petOwner/my-pets">My Pets</Link>
                  <button type="button" onClick={handleLogout}>
                    Logout
                  </button>
                </div>
              </details>
            </div>
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}

function getInitials(name: string | undefined) {
  if (!name) return "PO";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return initials || "PO";
}
