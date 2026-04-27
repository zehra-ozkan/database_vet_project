"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const navItems = [
  { href: "/petOwner/dashboard", label: "Dashboard" },
  { href: "/petOwner/book", label: "Book" },
  { href: "/petOwner/appointments", label: "Appointments" },
  { href: "/petOwner/lost-found", label: "Lost & Found" },
  { href: "/petOwner/my-pets", label: "My Pets" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [ownerName, setOwnerName] = useState("Pet Owner");

  useEffect(() => {
    const savedUser = localStorage.getItem("user");
    if (!savedUser) return;

    try {
      const user = JSON.parse(savedUser) as { name?: string };
      if (user.name) {
        setOwnerName(user.name);
      }
    } catch {
      setOwnerName("Pet Owner");
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
        <h2 className="mt-2 text-2xl font-black text-slate-800">Pet Owner</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">Welcome, {ownerName}</p>
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
