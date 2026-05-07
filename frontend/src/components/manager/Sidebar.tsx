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
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 py-4 pb-6">
        <Link href="/manager/dashboard" className="flex items-center rounded-2xl border border-[rgba(15,23,42,0.12)] bg-white/85 p-2 transition hover:opacity-85" aria-label="VetChain home">
          <span className="block h-[38px] w-[38px] rounded-2xl bg-[linear-gradient(135deg,rgba(109,40,217,0.95),rgba(5,150,105,0.55))] shadow-[0_12px_30px_rgba(109,40,217,0.16)]" />
        </Link>

        <nav className="flex flex-wrap items-center justify-end gap-2.5">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-[14px] border px-3.5 py-2.5 text-sm text-[#0f172a] transition ${
                  active
                    ? "border-[rgba(109,40,217,0.30)] bg-[rgba(109,40,217,0.10)]"
                    : "border-[rgba(15,23,42,0.12)] bg-white/75 hover:bg-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          <button onClick={handleLogout} className="rounded-[14px] border border-[rgba(15,23,42,0.12)] bg-white/75 px-3.5 py-2.5 text-sm text-[#0f172a] transition hover:bg-white">
            Logout
          </button>
        </nav>
      </div>
    </div>
  );
}
