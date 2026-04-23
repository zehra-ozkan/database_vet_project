"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const navItems = [
  { href: "/manager/dashboard", label: "Dashboard" },
  { href: "/manager/inventory", label: "Inventory" },
  { href: "/manager/logs", label: "Supply & Waste" },
  { href: "/manager/vaccinations", label: "Vaccinations" },
  { href: "/manager/billing", label: "Billing" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [managerName, setManagerName] = useState("Clinic Manager");

  useEffect(() => {
    const savedUser = localStorage.getItem("user");
    if (!savedUser) return;

    try {
      const user = JSON.parse(savedUser) as { name?: string };
      if (user.name) {
        setManagerName(user.name);
      }
    } catch {
      setManagerName("Clinic Manager");
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("user");
    router.push("/login");
  };

  return (
    <aside className="sticky top-0 flex h-screen w-full flex-col border-r border-white/70 bg-white/70 p-5 shadow-sm shadow-slate-200/70 backdrop-blur lg:w-72">
      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 shadow-sm shadow-slate-200/70">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">VetChain</p>
        <h2 className="mt-2 text-2xl font-black text-slate-800">Clinic Manager</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">Welcome, {managerName}</p>
      </div>

      <nav className="mt-6 flex flex-1 flex-col gap-2">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-2xl px-4 py-3 text-sm font-bold transition ${
                active ? "bg-slate-800 text-white shadow-lg shadow-slate-300" : "text-slate-600 hover:bg-white hover:text-slate-900"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <button
        onClick={handleLogout}
        className="rounded-2xl bg-rose-50 px-4 py-3 text-left text-sm font-bold text-rose-700 transition hover:bg-rose-100"
      >
        Logout
      </button>
    </aside>
  );
}
