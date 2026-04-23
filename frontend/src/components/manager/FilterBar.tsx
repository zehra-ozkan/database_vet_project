import type { ReactNode } from "react";

export default function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-3xl border border-white/80 bg-white/80 p-4 shadow-sm shadow-slate-200/70">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">{children}</div>
    </div>
  );
}

export function FilterInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-teal-300 focus:ring-4 focus:ring-teal-100"
    />
  );
}

export function FilterSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-teal-300 focus:ring-4 focus:ring-teal-100"
    />
  );
}
