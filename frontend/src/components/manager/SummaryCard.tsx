type SummaryCardProps = {
  title: string;
  value: string | number;
  helper?: string;
  accent?: "mint" | "peach" | "sky" | "rose";
};

const accents = {
  mint: "from-emerald-100 to-teal-50 text-emerald-700",
  peach: "from-orange-100 to-amber-50 text-orange-700",
  sky: "from-sky-100 to-cyan-50 text-sky-700",
  rose: "from-rose-100 to-pink-50 text-rose-700",
};

export default function SummaryCard({ title, value, helper, accent = "mint" }: SummaryCardProps) {
  return (
    <section className="rounded-3xl border border-white/80 bg-white/85 p-5 shadow-sm shadow-slate-200/70">
      <div className={`mb-4 h-2 w-16 rounded-full bg-gradient-to-r ${accents[accent]}`} />
      <p className="text-sm font-semibold text-slate-500">{title}</p>
      <p className="mt-2 text-3xl font-black tracking-tight text-slate-800">{value}</p>
      {helper ? <p className="mt-2 text-sm text-slate-500">{helper}</p> : null}
    </section>
  );
}
