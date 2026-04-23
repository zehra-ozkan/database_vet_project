import type { StatusTone } from "@/types/manager";

const toneClasses: Record<StatusTone, string> = {
  safe: "bg-emerald-50 text-emerald-700 border-emerald-200",
  low_stock: "bg-amber-50 text-amber-700 border-amber-200",
  expired: "bg-rose-50 text-rose-700 border-rose-200",
  damaged: "bg-red-50 text-red-700 border-red-200",
  overdue: "bg-rose-50 text-rose-700 border-rose-200",
  due_soon: "bg-sky-50 text-sky-700 border-sky-200",
  up_to_date: "bg-teal-50 text-teal-700 border-teal-200",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  unpaid: "bg-orange-50 text-orange-700 border-orange-200",
  neutral: "bg-slate-50 text-slate-600 border-slate-200",
};

const labels: Record<string, string> = {
  safe: "Safe",
  low_stock: "Low stock",
  expired: "Expired",
  damaged: "Damaged",
  overdue: "Overdue",
  due_soon: "Due soon",
  up_to_date: "Up to date",
  paid: "Paid",
  unpaid: "Unpaid",
  neutral: "Info",
};

export default function StatusBadge({ status }: { status?: string | null }) {
  const safeStatus = (status || "neutral") as StatusTone;
  const tone = toneClasses[safeStatus] || toneClasses.neutral;

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}>
      {labels[safeStatus] || status}
    </span>
  );
}
