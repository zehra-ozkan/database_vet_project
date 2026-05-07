"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import StatusBadge from "@/components/manager/StatusBadge";
import { apiGet, formatDate, formatMoney } from "@/lib/api";
import type {
  BillingSummary,
  CostBreakdownReportRow,
  DashboardAlerts,
  DashboardSummary,
  RestockFrequencyReportRow,
  StockConsumptionReportRow,
  VaccinationRow,
  WasteStatisticsReportRow,
} from "@/types/manager";

type ReportRow = {
  report: string;
  branch: string;
  period: string;
  indicator: string;
  notes: string;
};

export default function ManagerDashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [alerts, setAlerts] = useState<DashboardAlerts | null>(null);
  const [vaccinations, setVaccinations] = useState<VaccinationRow[]>([]);
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [stockConsumptionReport, setStockConsumptionReport] = useState<StockConsumptionReportRow[]>([]);
  const [wasteStatisticsReport, setWasteStatisticsReport] = useState<WasteStatisticsReportRow[]>([]);
  const [restockFrequencyReport, setRestockFrequencyReport] = useState<RestockFrequencyReportRow[]>([]);
  const [costBreakdownReport, setCostBreakdownReport] = useState<CostBreakdownReportRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      try {
        const [summaryData, alertData, vaccinationData, billingData, stockReportData, wasteReportData, restockReportData, costReportData] = await Promise.all([
          apiGet<DashboardSummary>("/manager/dashboard/summary"),
          apiGet<DashboardAlerts>("/manager/dashboard/alerts"),
          apiGet<VaccinationRow[]>("/manager/vaccinations"),
          apiGet<BillingSummary>("/manager/billing/summary"),
          apiGet<StockConsumptionReportRow[]>("/manager/reports/stock-consumption"),
          apiGet<WasteStatisticsReportRow[]>("/manager/reports/waste-statistics"),
          apiGet<RestockFrequencyReportRow[]>("/manager/reports/restock-frequency"),
          apiGet<CostBreakdownReportRow[]>("/manager/reports/cost-breakdown"),
        ]);

        if (!active) return;
        setSummary(summaryData);
        setAlerts(alertData);
        setVaccinations(vaccinationData);
        setBilling(billingData);
        setStockConsumptionReport(stockReportData);
        setWasteStatisticsReport(wasteReportData);
        setRestockFrequencyReport(restockReportData);
        setCostBreakdownReport(costReportData);
        setError("");
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Could not load dashboard");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadDashboard();
    return () => {
      active = false;
    };
  }, []);

  const lowStockCount = summary?.lowstockcount ?? null;
  const wastedInventoryCount = summary?.wastedinventory ?? null;
  const overdueVaccinationCount = summary?.overduevaccinations ?? null;
  const outstandingInvoicesTotal = billing?.totalunpaid ?? summary?.totalunpaid ?? null;
  const paidRevenue = billing?.totalrevenue ?? summary?.revenue ?? null;
  const stockConsumption = summary?.stockconsumption ?? null;
  const vaccinationCompliance = summary?.vaccinationcompliance ?? null;

  const reportRows = useMemo<ReportRow[]>(
    () => [
      {
        report: "Stock consumption",
        branch: branchList(vaccinations),
        period: "Current",
        indicator: formatCount(stockConsumption, " prescribed"),
        notes: "Inventory threshold review",
      },
      {
        report: "Vaccination compliance",
        branch: branchList(vaccinations),
        period: "Current",
        indicator: vaccinationCompliance === null ? "No data" : `${vaccinationCompliance}% up to date`,
        notes: "Vaccination plan status",
      },
      {
        report: "Overdue vaccinations",
        branch: branchList(vaccinations),
        period: "Current",
        indicator: formatCount(overdueVaccinationCount, " overdue"),
        notes: "Follow-up required",
      },
      {
        report: "Wasted inventory (expired)",
        branch: branchList(vaccinations),
        period: "Current",
        indicator: formatCount(wastedInventoryCount, " waste logs"),
        notes: "Medicine status review",
      },
      {
        report: "Revenue per branch",
        branch: branchList(vaccinations),
        period: "Current",
        indicator: paidRevenue === null ? "No data" : formatMoney(paidRevenue),
        notes: "Billing compliance snapshot",
      },
    ],
    [overdueVaccinationCount, paidRevenue, stockConsumption, vaccinationCompliance, vaccinations, wastedInventoryCount],
  );

  if (loading) return <PanelMessage message="Loading dashboard..." />;
  if (error) return <PanelMessage message={error} tone="error" />;

  const lowStockText = formatLowStockAlert(alerts?.lowStock, lowStockCount);
  const overdueText = formatVaccinationAlert(alerts?.vaccinations, overdueVaccinationCount);
  const policyOwner = vaccinations.find((row) => row.recommendedvet)?.recommendedvet || "No data";
  const planCoverage = formatPlanCoverage(summary);
  const topConsumedMedicine = stockConsumptionReport[0];
  const totalPrescribed = stockConsumptionReport.reduce((total, row) => total + Number(row.prescribedcount || 0), 0);
  const totalWasteLogs = wasteStatisticsReport.reduce((total, row) => total + Number(row.wastelogcount || 0), 0);
  const expiredSupplyRejected = wasteStatisticsReport.reduce((total, row) => total + Number(row.expiredsupplyrejected || 0), 0);
  const successfulStockIncreases = restockFrequencyReport.reduce((total, row) => total + Number(row.successfulstockincreases || 0), 0);
  const estimatedInventoryUnits = costBreakdownReport.reduce((total, row) => total + Number(row.estimatedinventoryunits || 0), 0);

  return (
    <div className="space-y-6">
      <section className="grid items-stretch gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <section className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-sm shadow-slate-200/70 md:p-8">
            <h1 className="text-3xl font-black tracking-tight text-slate-800 md:text-4xl">Manager dashboard</h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-500">
              Track branch medicine inventory, supply logs, stock usage, billing compliance, and vaccination indicators across branches.
            </p>
          </section>

          <div className="grid gap-5 md:grid-cols-3">
            <KpiCard title="Low stock items" value={formatKpi(lowStockCount)} />
            <KpiCard title="Overdue vaccinations" value={formatKpi(overdueVaccinationCount)} />
            <KpiCard title="Outstanding invoices" value={outstandingInvoicesTotal === null ? "No data" : formatMoney(outstandingInvoicesTotal)} />
          </div>
        </div>

        <div className="flex h-full flex-col">
          <section className="h-full rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-sm shadow-slate-200/70">
            <h2 className="text-lg font-black text-slate-800">Quick Access</h2>
            <Link href="/manager/inventory" className="mt-5 inline-flex w-full justify-center rounded-2xl bg-slate-800 px-4 py-3 text-sm font-bold text-white shadow-sm">
              Inventory & supply
            </Link>
          </section>
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-sm shadow-slate-200/70">
        <h2 className="text-xl font-black text-slate-800">Alerts</h2>
        <div className="mt-5 space-y-3">
          <AlertRow label="Low stock" text={lowStockText} />
          <AlertRow label="Vaccination overdue" text={overdueText} />
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-sm shadow-slate-200/70">
        <h2 className="text-xl font-black text-slate-800">Inventory Reports</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <InfoCard title="Stock consumption" value={`${totalPrescribed} prescribed`} />
          <InfoCard title="Waste statistics" value={`${totalWasteLogs} waste logs`} />
          <InfoCard title="Restock frequency" value={`${successfulStockIncreases} increases`} />
          <InfoCard title="Cost breakdown" value={`${estimatedInventoryUnits} units`} />
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.18em] text-slate-400">
              <tr className="border-b border-slate-100">
                <TableHead>Report</TableHead>
                <TableHead>Metric</TableHead>
                <TableHead>Detail</TableHead>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-600">
              <tr>
                <TableCell strong>Top consumed medicine</TableCell>
                <TableCell>{topConsumedMedicine ? `${topConsumedMedicine.prescribedcount} prescribed` : "No data"}</TableCell>
                <TableCell>{topConsumedMedicine ? `${topConsumedMedicine.medicinename} at ${topConsumedMedicine.branch}` : "No prescription usage found"}</TableCell>
              </tr>
              <tr>
                <TableCell strong>Expired supply rejected</TableCell>
                <TableCell>{expiredSupplyRejected}</TableCell>
                <TableCell>WasteLog entries created from rejected expired supply</TableCell>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-sm shadow-slate-200/70">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.18em] text-slate-400">
              <tr className="border-b border-slate-100">
                <TableHead>Report</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Indicator</TableHead>
                <TableHead>Notes</TableHead>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-600">
              {reportRows.map((row) => (
                <tr key={row.report}>
                  <TableCell strong>{row.report}</TableCell>
                  <TableCell>{row.branch}</TableCell>
                  <TableCell>{row.period}</TableCell>
                  <TableCell>{row.indicator}</TableCell>
                  <TableCell>{row.notes}</TableCell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-sm shadow-slate-200/70">
        <h2 className="text-2xl font-black text-slate-800">Vaccination Plan & Records</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <InfoCard title="Policy owner" value={policyOwner} />
          <InfoCard title="Plan coverage" value={planCoverage} />
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.18em] text-slate-400">
              <tr className="border-b border-slate-100">
                <TableHead>Branch</TableHead>
                <TableHead>Pet</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Vaccine</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Next due</TableHead>
                <TableHead>Admin vet</TableHead>
                <TableHead>Status</TableHead>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-600">
              {vaccinations.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-400" colSpan={9}>
                    No data
                  </td>
                </tr>
              ) : (
                vaccinations.map((row) => (
                  <tr key={row.recordid}>
                    <TableCell>{row.branch || "No data"}</TableCell>
                    <TableCell strong>{row.petname || "No data"}</TableCell>
                    <TableCell>{row.ownername || "No data"}</TableCell>
                    <TableCell>{row.vaccinename || "No data"}</TableCell>
                    <TableCell>{formatDate(row.lastshotdate)}</TableCell>
                    <TableCell>{row.batch || "No data"}</TableCell>
                    <TableCell>{formatDate(row.nextduedate)}</TableCell>
                    <TableCell>{row.recommendedvet || "No data"}</TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function KpiCard({ title, value }: { title: string; value: string | number }) {
  return (
    <section className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-sm shadow-slate-200/70">
      <p className="text-sm font-bold text-slate-500">{title}</p>
      <p className="mt-4 text-4xl font-black tracking-tight text-slate-800">{value}</p>
    </section>
  );
}

function AlertRow({ label, text }: { label: string; text: string }) {
  return (
    <div className="grid gap-2 rounded-2xl bg-slate-50/80 px-4 py-3 text-sm md:grid-cols-[210px_1fr] md:items-center">
      <p className="font-black text-slate-700">{label}</p>
      <p className="text-slate-500">{text}</p>
    </div>
  );
}

function InfoCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-3xl bg-slate-50/80 p-5">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{title}</p>
      <p className="mt-3 text-xl font-black text-slate-800">{value}</p>
    </div>
  );
}

function TableHead({ children }: { children: ReactNode }) {
  return <th className="px-4 py-4 font-black">{children}</th>;
}

function TableCell({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return <td className={`px-4 py-4 align-middle ${strong ? "font-black text-slate-800" : ""}`}>{children}</td>;
}

function PanelMessage({ message, tone = "normal" }: { message: string; tone?: "normal" | "error" }) {
  return <div className={`rounded-3xl bg-white/90 p-6 text-sm font-semibold shadow-sm ${tone === "error" ? "text-rose-700" : "text-slate-500"}`}>{message}</div>;
}

function formatLowStockAlert(items: DashboardAlerts["lowStock"] | undefined, lowStockCount: number | null) {
  if (!items) return "No data";
  if (items.length === 0) {
    return lowStockCount === null ? "No data" : `${lowStockCount} items below threshold`;
  }

  return items.map((item) => `${item.name || "No data"} at ${item.branch || "No data"}`).join(" · ");
}

function formatVaccinationAlert(items: DashboardAlerts["vaccinations"] | undefined, overdueCount: number | null) {
  if (items && items.length > 0) {
    return items
      .map((item) => `${item.petname || item.petName || "No data"} overdue${item.ownername || item.ownerName ? ` for ${item.ownername || item.ownerName}` : ""}`)
      .join(" · ");
  }

  return overdueCount === null ? "No data" : `${overdueCount} pets with overdue vaccines across branches`;
}

function branchList(rows: VaccinationRow[]) {
  const branches = Array.from(new Set(rows.map((row) => row.branch).filter(Boolean)));
  return branches.length ? branches.slice(0, 2).join(", ") : "No data";
}

function formatKpi(value: number | null) {
  return value === null ? "No data" : value;
}

function formatCount(value: number | null, suffix: string) {
  return value === null ? "No data" : `${value}${suffix}`;
}

function formatPlanCoverage(summary: DashboardSummary | null) {
  if (!summary || summary.vaccinatedpets === null || summary.totalpets === null) return "No data";

  return `${summary.vaccinatedpets} of ${summary.totalpets} pets`;
}
