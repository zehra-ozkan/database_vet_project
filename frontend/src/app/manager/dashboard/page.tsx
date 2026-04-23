"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DataTable from "@/components/manager/DataTable";
import StatusBadge from "@/components/manager/StatusBadge";
import SummaryCard from "@/components/manager/SummaryCard";
import Topbar from "@/components/manager/Topbar";
import { apiGet, formatDate, formatMoney } from "@/lib/api";
import type { ActivityItem, DashboardAlerts, DashboardSummary, InventoryItem } from "@/types/manager";

export default function ManagerDashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [alerts, setAlerts] = useState<DashboardAlerts | null>(null);
  const [lowStock, setLowStock] = useState<InventoryItem[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [summaryData, alertData, lowStockData, activityData] = await Promise.all([
          apiGet<DashboardSummary>("/manager/dashboard/summary"),
          apiGet<DashboardAlerts>("/manager/dashboard/alerts"),
          apiGet<InventoryItem[]>("/manager/dashboard/low-stock-preview"),
          apiGet<ActivityItem[]>("/manager/dashboard/recent-activity"),
        ]);
        setSummary(summaryData);
        setAlerts(alertData);
        setLowStock(lowStockData);
        setActivity(activityData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load dashboard");
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  if (loading) return <ManagerLoading label="Loading dashboard..." />;
  if (error) return <ManagerError message={error} />;

  return (
    <div>
      <Topbar
        title="Dashboard"
        subtitle="A quick pulse check for clinic inventory, vaccination follow-ups, and billing health."
        action={
          <>
            <Link className="rounded-2xl bg-slate-800 px-4 py-3 text-sm font-bold text-white" href="/manager/inventory">
              Log new supply
            </Link>
            <Link className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm" href="/manager/logs">
              Open waste logs
            </Link>
          </>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="Low stock items" value={summary?.lowstockitems ?? 0} helper="At or below threshold" accent="peach" />
        <SummaryCard title="Expired/damaged" value={summary?.expireddamageditems ?? 0} helper="Needs manager attention" accent="rose" />
        <SummaryCard title="Overdue vaccines" value={summary?.overduevaccinations ?? 0} helper="Based on next due date" accent="sky" />
        <SummaryCard title="Unpaid bills" value={formatMoney(summary?.unpaidbillstotal)} helper="Total outstanding" accent="mint" />
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-3">
        <AlertCard title="Low Stock Alerts" items={alerts?.lowStock || []} labelKey="name" detailKey="branch" />
        <AlertCard title="Vaccination Alerts" items={alerts?.vaccinations || []} labelKey="petname" detailKey="ownername" />
        <AlertCard title="Billing Alerts" items={alerts?.bills || []} labelKey="ownername" detailKey="duedate" />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div>
          <h2 className="mb-3 text-xl font-black text-slate-800">Low Stock Medicines</h2>
          <DataTable
            rows={lowStock}
            columns={[
              { header: "Medicine", cell: (row) => <span className="font-bold text-slate-800">{row.name}</span> },
              { header: "Branch", cell: (row) => row.branch },
              { header: "Qty", cell: (row) => row.quantity },
              { header: "Threshold", cell: (row) => row.threshold },
              { header: "Status", cell: (row) => <StatusBadge status={row.displaystatus || row.status} /> },
            ]}
          />
        </div>
        <div className="rounded-3xl border border-white/80 bg-white/85 p-5 shadow-sm shadow-slate-200/70">
          <h2 className="text-xl font-black text-slate-800">Recent Activity</h2>
          <div className="mt-4 space-y-3">
            {activity.map((item) => (
              <div key={`${item.type}-${item.reference}`} className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm font-black text-slate-700">{item.type}</p>
                <p className="mt-1 text-sm text-slate-500">{item.description}</p>
                <p className="mt-2 text-xs font-bold text-teal-600">{formatDate(item.activitydate)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-3 md:grid-cols-4">
        <QuickAction href="/manager/inventory" label="Log new supply" />
        <QuickAction href="/manager/logs" label="Open waste logs" />
        <QuickAction href="/manager/vaccinations" label="Vaccination compliance" />
        <QuickAction href="/manager/billing" label="Billing page" />
      </section>
    </div>
  );
}

function AlertCard({ title, items, labelKey, detailKey }: { title: string; items: Array<Record<string, string | number | null>>; labelKey: string; detailKey: string }) {
  return (
    <section className="rounded-3xl border border-white/80 bg-white/85 p-5 shadow-sm shadow-slate-200/70">
      <h2 className="text-lg font-black text-slate-800">{title}</h2>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? <p className="text-sm text-slate-400">No alerts right now.</p> : null}
        {items.map((item, index) => (
          <div key={index} className="rounded-2xl bg-rose-50/60 p-4 text-sm">
            <p className="font-bold text-slate-700">{String(item[labelKey] || "Item")}</p>
            <p className="mt-1 text-slate-500">{String(item[detailKey] || "Needs review")}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function QuickAction({ href, label }: { href: string; label: string }) {
  return (
    <Link className="rounded-3xl bg-white/85 p-5 text-center text-sm font-black text-slate-700 shadow-sm transition hover:-translate-y-1 hover:shadow-md" href={href}>
      {label}
    </Link>
  );
}

function ManagerLoading({ label }: { label: string }) {
  return <div className="rounded-3xl bg-white/80 p-6 text-sm font-semibold text-slate-500 shadow-sm">{label}</div>;
}

function ManagerError({ message }: { message: string }) {
  return <div className="rounded-3xl bg-rose-50 p-6 text-sm font-semibold text-rose-700 shadow-sm">{message}</div>;
}
