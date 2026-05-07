"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
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
  const [costBreakdownReport, setCostBreakdownReport] = useState<CostBreakdownReportRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      try {
        const [summaryData, alertData, vaccinationData, billingData, stockReportData, wasteReportData, , costReportData] = await Promise.all([
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

  if (loading) return <PanelMessage message="Loading dashboard..." />;
  if (error) return <PanelMessage message={error} tone="error" />;

  const lowStockText = formatLowStockAlert(alerts?.lowStock, lowStockCount);
  const overdueText = formatVaccinationAlert(alerts?.vaccinations, overdueVaccinationCount);
  const topConsumedMedicine = stockConsumptionReport[0];
  const totalPrescribed = stockConsumptionReport.reduce((total, row) => total + Number(row.prescribedcount || 0), 0);
  const totalWasteLogs = wasteStatisticsReport.reduce((total, row) => total + Number(row.wastelogcount || 0), 0);
  const expiredSupplyRejected = wasteStatisticsReport.reduce((total, row) => total + Number(row.expiredsupplyrejected || 0), 0);
  const policyOwner = vaccinations.find((row) => row.recommendedvet)?.recommendedvet || "No policy owner found";
  const planCoverage = formatPlanCoverage(vaccinations, summary);
  const reportRows: ReportRow[] = [
    {
      report: "Stock consumption",
      branch: branchList(stockConsumptionReport.map((row) => row.branch)),
      period: "Current",
      indicator: stockConsumptionReport.length ? `${totalPrescribed} units` : formatCount(stockConsumption, " units"),
      notes: topConsumedMedicine ? `Top: ${topConsumedMedicine.medicinename}` : "No prescription usage found",
    },
    {
      report: "Vaccination compliance",
      branch: branchList(vaccinations.map((row) => row.branch)),
      period: "Current",
      indicator: vaccinationCompliance === null ? "No vaccination compliance data" : `${vaccinationCompliance}%`,
      notes: summary?.totalpets ? `${summary.vaccinatedpets} of ${summary.totalpets} pets vaccinated` : "No pet records found",
    },
    {
      report: "Overdue vaccinations",
      branch: branchList(vaccinations.filter((row) => row.status === "overdue").map((row) => row.branch)),
      period: "Current",
      indicator: formatCount(overdueVaccinationCount, " pets"),
      notes: overdueVaccinationCount ? "Follow-up required" : "No overdue vaccination records",
    },
    {
      report: "Wasted inventory (expired)",
      branch: branchList(wasteStatisticsReport.map((row) => row.branch)),
      period: "Current",
      indicator: wasteStatisticsReport.length ? `${totalWasteLogs} units` : formatCount(wastedInventoryCount, " units"),
      notes: `${expiredSupplyRejected} expired supply rejected`,
    },
    {
      report: "Revenue per branch",
      branch: branchList(costBreakdownReport.map((row) => row.branch)),
      period: "Current",
      indicator: paidRevenue === null ? "No billing data" : formatMoney(paidRevenue),
      notes: outstandingInvoicesTotal === null ? "No invoice data" : `${formatMoney(outstandingInvoicesTotal)} outstanding`,
    },
  ];

  return (
    <div className="space-y-4">
      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-[18px] border border-[rgba(15,23,42,0.12)] bg-white/75 p-5 shadow-[0_16px_45px_rgba(15,23,42,0.10)]">
          <h1 className="m-0 text-2xl font-extrabold text-[#0f172a]">Manager dashboard</h1>
          <p className="mt-1.5 text-sm leading-6 text-[rgba(15,23,42,0.68)]">
            Track branch medicine inventory, supply logs, stock usage, billing compliance, and vaccination indicators across branches.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <KpiCard title="Low stock items" value={formatKpi(lowStockCount)} />
            <KpiCard title="Overdue vaccinations" value={formatKpi(overdueVaccinationCount)} />
            <KpiCard title="Outstanding invoices" value={outstandingInvoicesTotal === null ? "No invoice data" : formatMoney(outstandingInvoicesTotal)} />
          </div>
        </section>

        <section className="rounded-[18px] border border-[rgba(15,23,42,0.12)] bg-white/75 p-5 shadow-[0_16px_45px_rgba(15,23,42,0.10)]">
          <h2 className="m-0 mb-3 text-base font-bold text-[#0f172a]">Quick access</h2>
          <Link href="/manager/inventory" className="block w-full rounded-[14px] border border-[rgba(109,40,217,0.35)] bg-[linear-gradient(135deg,rgba(109,40,217,0.14),rgba(59,130,246,0.08))] px-4 py-2.5 text-center text-sm text-[#0f172a] transition hover:opacity-90">
            Inventory & supply
          </Link>
        </section>
      </section>

      <section className="rounded-[18px] border border-[rgba(15,23,42,0.12)] bg-white/75 p-5 shadow-[0_16px_45px_rgba(15,23,42,0.10)]">
        <h2 className="m-0 mb-1.5 text-[22px] font-extrabold text-[#0f172a]">Alerts</h2>
        <p className="m-0 mb-5 text-sm text-[rgba(15,23,42,0.68)]">Stock, compliance, and operational reminders</p>
        <div className="grid grid-cols-1 gap-0">
          <AlertRow label="Low stock" text={lowStockText} tone="warning" />
          <AlertRow label="Vaccination overdue" text={overdueText} tone="danger" />
        </div>
      </section>

      <section className="rounded-[18px] border border-[rgba(15,23,42,0.12)] bg-white/75 p-5 shadow-[0_16px_45px_rgba(15,23,42,0.10)]">
        <h2 className="m-0 mb-1.5 text-[22px] font-extrabold text-[#0f172a]">Reports snapshot</h2>
        <p className="m-0 mb-5 text-sm text-[rgba(15,23,42,0.68)]">Key analytics for inventory usage, vaccination compliance, and revenue by branch.</p>
        <div className="mt-3.5 overflow-auto rounded-2xl border border-[rgba(15,23,42,0.12)] bg-[rgba(2,6,23,0.02)]">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr>
                <TableHead>Report</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Indicator</TableHead>
                <TableHead>Notes</TableHead>
              </tr>
            </thead>
            <tbody>
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

      <section className="rounded-[18px] border border-[rgba(15,23,42,0.12)] bg-white/75 p-5 shadow-[0_16px_45px_rgba(15,23,42,0.10)]">
        <h2 className="m-0 mb-1.5 text-[22px] font-extrabold text-[#0f172a]">Vaccination Plan & Records</h2>
        <p className="m-0 text-sm text-[rgba(15,23,42,0.68)]">Threshold: 30 days past due (configurable) · Owners see upcoming/overdue highlights</p>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <InfoCard title="Policy owner" value={policyOwner} />
          <InfoCard title="Plan coverage" value={planCoverage} />
        </div>

        <div className="mt-4 overflow-auto rounded-2xl border border-[rgba(15,23,42,0.12)] bg-[rgba(2,6,23,0.02)]">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead>
              <tr>
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
            <tbody>
              {vaccinations.length === 0 ? (
                <tr>
                  <td className="px-3.5 py-8 text-center text-[13px] text-[rgba(15,23,42,0.68)]" colSpan={9}>
                    No vaccination records found.
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
    <section className="rounded-2xl border border-[rgba(15,23,42,0.10)] bg-white/70 p-3.5">
      <p className="m-0 text-[13px] text-[rgba(15,23,42,0.68)]">{title}</p>
      <p className="mt-1.5 text-2xl font-black text-[#0f172a]">{value}</p>
    </section>
  );
}

function AlertRow({ label, text, tone }: { label: string; text: string; tone: "warning" | "danger" }) {
  const border = tone === "warning" ? "border-l-[#d97706]" : "border-l-[#e11d48]";

  return (
    <div className={`mb-2.5 rounded-2xl border border-l-4 border-[rgba(15,23,42,0.12)] bg-white/70 p-3.5 ${border}`}>
      <p className="m-0 font-bold text-[#0f172a]">{label}</p>
      <p className="m-0 mt-1 text-[13px] text-[rgba(15,23,42,0.68)]">{text}</p>
    </div>
  );
}

function InfoCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[rgba(15,23,42,0.12)] bg-white/70 p-3.5">
      <p className="m-0 font-bold text-[#0f172a]">{title}</p>
      <p className="m-0 mt-1 text-[13px] text-[rgba(15,23,42,0.68)]">{value}</p>
    </div>
  );
}

function TableHead({ children }: { children: ReactNode }) {
  return <th className="border-b border-[rgba(15,23,42,0.08)] px-3.5 py-3 text-left text-xs font-semibold text-[rgba(15,23,42,0.68)]">{children}</th>;
}

function TableCell({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return <td className={`border-b border-[rgba(15,23,42,0.08)] px-3.5 py-3 align-middle text-[13px] text-[#0f172a] last:border-b-0 ${strong ? "font-semibold" : ""}`}>{children}</td>;
}

function PanelMessage({ message, tone = "normal" }: { message: string; tone?: "normal" | "error" }) {
  return <div className={`rounded-[18px] border border-[rgba(15,23,42,0.12)] bg-white/75 p-5 text-sm shadow-[0_16px_45px_rgba(15,23,42,0.10)] ${tone === "error" ? "text-rose-700" : "text-[rgba(15,23,42,0.68)]"}`}>{message}</div>;
}

function formatLowStockAlert(items: DashboardAlerts["lowStock"] | undefined, lowStockCount: number | null) {
  if (!items) return "Low stock data is unavailable.";
  if (items.length === 0) {
    return lowStockCount === null || lowStockCount === 0 ? "No medicines are currently below threshold." : `${lowStockCount} items below threshold`;
  }

  return items.map((item) => `${item.name || "Unnamed medicine"} at ${item.branch || "unassigned branch"}`).join(" · ");
}

function formatVaccinationAlert(items: DashboardAlerts["vaccinations"] | undefined, overdueCount: number | null) {
  if (items && items.length > 0) {
    return items
      .map((item) => `${item.petname || item.petName || "Unnamed pet"} overdue${item.ownername || item.ownerName ? ` for ${item.ownername || item.ownerName}` : ""}`)
      .join(" · ");
  }

  return overdueCount === null || overdueCount === 0 ? "No pets currently have overdue vaccines." : `${overdueCount} pets with overdue vaccines across branches`;
}

function branchList(branches: Array<string | null | undefined>) {
  const uniqueBranches = Array.from(new Set(branches.filter(Boolean)));
  return uniqueBranches.length ? uniqueBranches.slice(0, 2).join(", ") : "All";
}

function formatKpi(value: number | null) {
  return value === null ? "No data" : value;
}

function formatCount(value: number | null, suffix: string) {
  return value === null ? "No data" : `${value}${suffix}`;
}

function formatPlanCoverage(vaccinations: VaccinationRow[], summary: DashboardSummary | null) {
  const vaccineNames = Array.from(new Set(vaccinations.map((row) => row.vaccinename).filter(Boolean)));
  if (vaccineNames.length) return vaccineNames.slice(0, 4).join(", ");
  if (!summary || summary.vaccinatedpets === null || summary.totalpets === null) return "No vaccination plan records found";

  return `${summary.vaccinatedpets} of ${summary.totalpets} pets`;
}
