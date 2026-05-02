"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const navItems = [
  { href: "/manager/dashboard", label: "Dashboard" },
  { href: "/manager/inventory", label: "Inventory" },
  { href: "/manager/vaccination", label: "Vaccination" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem("user");
    document.cookie = "session_user=; path=/; max-age=0; samesite=lax";
    router.push("/login");
  };

  return (
    <header className="sticky top-0 z-10 border-b border-white/60 bg-white/45 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 md:px-8">
        <Link href="/manager/dashboard" className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-lg font-black text-teal-700 shadow-sm shadow-slate-200/70">
          V
        </Link>

        <nav className="flex flex-wrap items-center justify-end gap-2">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-2xl px-4 py-2 text-sm font-bold transition ${
                active ? "bg-slate-800 text-white shadow-sm" : "bg-white/70 text-slate-600 shadow-sm hover:bg-white hover:text-slate-900"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
          <button onClick={handleLogout} className="rounded-2xl bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700 shadow-sm transition hover:bg-rose-100">
            Logout
          </button>
        </nav>
      </div>
    </header>
  );
}
