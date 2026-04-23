import type { ReactNode } from "react";

type TopbarProps = {
  title: string;
  subtitle: string;
  action?: ReactNode;
};

export default function Topbar({ title, subtitle, action }: TopbarProps) {
  return (
    <header className="mb-8 flex flex-col gap-4 rounded-[2rem] border border-white/80 bg-white/75 p-6 shadow-sm shadow-slate-200/70 backdrop-blur md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-teal-500">Clinic Manager</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-800 md:text-4xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{subtitle}</p>
      </div>
      {action ? <div className="flex flex-wrap gap-3">{action}</div> : null}
    </header>
  );
}
