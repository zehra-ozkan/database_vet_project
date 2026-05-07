"use client";

import { startTransition, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { apiGet, formatDate } from "@/lib/api";
import type { MostAdministeredVaccineReportRow, VaccinationComplianceReportRow, VaccinationOverdueRateReportRow, VaccinationRow, VaccinationSummary } from "@/types/manager";

type ClinicBranch = {
  branchid: number;
  name: string;
};

export default function VaccinationPage() {
  const [summary, setSummary] = useState<VaccinationSummary | null>(null);
  const [rows, setRows] = useState<VaccinationRow[]>([]);
  const [branches, setBranches] = useState<ClinicBranch[]>([]);
  const [complianceReports, setComplianceReports] = useState<VaccinationComplianceReportRow[]>([]);
  const [administeredVaccines, setAdministeredVaccines] = useState<MostAdministeredVaccineReportRow[]>([]);
  const [overdueRates, setOverdueRates] = useState<VaccinationOverdueRateReportRow[]>([]);
  const [filters, setFilters] = useState({ branch: "", status: "" });
  const [error, setError] = useState("");

  async function loadVaccinations() {
    try {
      const [summaryData, rowData] = await Promise.all([
        apiGet<VaccinationSummary>("/manager/vaccination/summary"),
        apiGet<VaccinationRow[]>("/manager/vaccination", filters),
      ]);
      setSummary(summaryData);
      setRows(rowData);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load vaccination data");
    }
  }

  useEffect(() => {
    let active = true;

    async function loadInitialVaccinations() {
      try {
        const [summaryData, rowData, branchData, complianceData, vaccineData, overdueData] = await Promise.all([
          apiGet<VaccinationSummary>("/manager/vaccination/summary"),
          apiGet<VaccinationRow[]>("/manager/vaccination"),
          apiGet<ClinicBranch[]>("/manager/branches"),
          apiGet<VaccinationComplianceReportRow[]>("/manager/reports/vaccination-compliance"),
          apiGet<MostAdministeredVaccineReportRow[]>("/manager/reports/most-administered-vaccines"),
          apiGet<VaccinationOverdueRateReportRow[]>("/manager/reports/vaccination-overdue-rate"),
        ]);
        if (active) {
          startTransition(() => {
            setSummary(summaryData);
            setRows(rowData);
            setBranches(branchData);
            setComplianceReports(complianceData);
            setAdministeredVaccines(vaccineData);
            setOverdueRates(overdueData);
            setError("");
          });
        }
      } catch (err) {
        if (active) {
          startTransition(() => setError(err instanceof Error ? err.message : "Could not load vaccination data"));
        }
      }
    }

    loadInitialVaccinations();
    return () => {
      active = false;
    };
  }, []);

  function exportAdminReportsPdf() {
    const reportWindow = window.open("", "_blank", "width=1100,height=800");
    if (!reportWindow) {
      setError("Could not open the PDF export window. Please allow pop-ups and try again.");
      return;
    }

    reportWindow.document.write(buildAdminReportsDocument({ complianceReports, administeredVaccines, overdueRates }));
    reportWindow.document.close();
    reportWindow.focus();
    reportWindow.print();
  }

  return (
    <div className="space-y-4">
      <section className={sectionClass}>
        <h1 className="m-0 text-[22px] font-extrabold text-[#0f172a]">Vaccination compliance</h1>
        <p className="m-0 mt-1.5 text-sm leading-6 text-[rgba(15,23,42,0.68)]">
          Indicators from stored due dates and records. Upcoming/overdue vaccines highlighted.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <KpiCard title="Overdue" value={summary?.overdue ?? "No data"} />
          <KpiCard title="Due within 30 days" value={summary?.duewithin30days ?? "No data"} />
          <KpiCard title="Up to date" value={summary?.uptodate ?? "No data"} />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <LabeledField label="Branch">
            <FormSelect ariaLabel="Clinic" value={filters.branch} onChange={(value) => setFilters({ ...filters, branch: value })}>
              <option value="">All clinics</option>
              {branches.map((branch) => (
                <option key={branch.branchid} value={branch.branchid}>
                  {branch.name}
                </option>
              ))}
            </FormSelect>
          </LabeledField>
          <LabeledField label="Status">
            <FormSelect ariaLabel="Status" value={filters.status} onChange={(value) => setFilters({ ...filters, status: value })}>
              <option value="">All</option>
              <option value="overdue">Overdue</option>
              <option value="due_soon">Due soon</option>
              <option value="up_to_date">Up to date</option>
            </FormSelect>
          </LabeledField>
          <button onClick={loadVaccinations} className={primaryButtonClass}>
            Apply filters
          </button>
        </div>

        {error ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div> : null}

        <ReportTable
          rows={rows}
          emptyMessage="No vaccination records found."
          columns={[
            { header: "Pet", cell: (row) => <span className="font-semibold text-[#0f172a]">{row.petname}</span> },
            { header: "Owner", cell: (row) => row.ownername },
            { header: "Vaccine", cell: (row) => row.vaccinename },
            { header: "Last date", cell: (row) => formatDate(row.lastshotdate) },
            { header: "Next due", cell: (row) => formatDate(row.nextduedate) },
            { header: "Branch", cell: (row) => row.branch },
            { header: "Status", cell: (row) => <StatusPill status={row.status} /> },
          ]}
        />
      </section>

      <section className={sectionClass}>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="m-0 text-[22px] font-extrabold text-[#0f172a]">Admin Reports</h2>
            <p className="m-0 mt-1.5 text-sm text-[rgba(15,23,42,0.68)]">Administrative vaccination analytics by breed, vaccine usage, and branch overdue rate.</p>
          </div>
          <button onClick={exportAdminReportsPdf} className={secondaryButtonClass}>
            Export admin reports (PDF)
          </button>
        </div>
        <div className="mt-5 space-y-5">
          <ReportPanel title="Compliance by species / breed">
            <ReportTable
              rows={complianceReports}
              emptyMessage="No pet compliance data found."
              columns={[
                { header: "Species", cell: (row) => <span className="font-semibold text-[#0f172a]">{row.species}</span> },
                { header: "Breed", cell: (row) => row.breed },
                { header: "Pets", cell: (row) => row.totalpets },
                { header: "Compliant", cell: (row) => row.compliantpets },
                { header: "Rate", cell: (row) => `${row.compliancerate}%` },
              ]}
            />
          </ReportPanel>
          <ReportPanel title="Most administered vaccines">
            <ReportTable
              rows={administeredVaccines}
              emptyMessage="No vaccine administration data found."
              columns={[
                { header: "Vaccine", cell: (row) => <span className="font-semibold text-[#0f172a]">{row.vaccinename}</span> },
                { header: "Administrations", cell: (row) => row.administrationcount },
              ]}
            />
          </ReportPanel>
          <ReportPanel title="Overdue rates per branch">
            <ReportTable
              rows={overdueRates}
              emptyMessage="No branch vaccination plans found."
              columns={[
                { header: "Branch", cell: (row) => <span className="font-semibold text-[#0f172a]">{row.branch}</span> },
                { header: "Plans", cell: (row) => row.totalplans },
                { header: "Overdue", cell: (row) => row.overdueplans },
                { header: "Rate", cell: (row) => `${row.overduerate}%` },
              ]}
            />
          </ReportPanel>
        </div>
      </section>
    </div>
  );
}

const sectionClass = "rounded-[18px] border border-[rgba(15,23,42,0.12)] bg-white/75 p-5 shadow-[0_16px_45px_rgba(15,23,42,0.10)]";
const primaryButtonClass = "self-end rounded-[14px] border border-[rgba(109,40,217,0.35)] bg-[linear-gradient(135deg,rgba(109,40,217,0.14),rgba(59,130,246,0.08))] px-4 py-2.5 text-sm font-semibold text-[#0f172a] transition hover:opacity-90";
const secondaryButtonClass = "rounded-[14px] border border-[rgba(109,40,217,0.35)] bg-[linear-gradient(135deg,rgba(109,40,217,0.12),rgba(59,130,246,0.07))] px-4 py-2.5 text-sm font-semibold text-[#0f172a] transition hover:opacity-90";
const controlClass = "w-full rounded-[14px] border border-[rgba(15,23,42,0.12)] bg-white/85 px-3.5 py-2.5 text-sm text-[#0f172a] outline-none transition focus:border-[rgba(109,40,217,0.35)] focus:ring-4 focus:ring-violet-100";

type ReportTableColumn<T> = {
  header: string;
  cell: (row: T) => ReactNode;
};

function KpiCard({ title, value }: { title: string; value: string | number }) {
  return (
    <section className="rounded-2xl border border-[rgba(15,23,42,0.10)] bg-white/70 p-3.5 shadow-[0_16px_45px_rgba(15,23,42,0.08)]">
      <p className="m-0 text-[13px] text-[rgba(15,23,42,0.68)]">{title}</p>
      <p className="mt-1.5 text-2xl font-black text-[#0f172a]">{value}</p>
    </section>
  );
}

function ReportPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-[rgba(15,23,42,0.12)] bg-white/70 p-3.5">
      <h3 className="m-0 text-base font-bold text-[#0f172a]">{title}</h3>
      {children}
    </div>
  );
}

function ReportTable<T>({ columns, rows, emptyMessage = "No records found." }: { columns: Array<ReportTableColumn<T>>; rows: T[]; emptyMessage?: string }) {
  return (
    <div className="mt-3.5 overflow-auto rounded-2xl border border-[rgba(15,23,42,0.12)] bg-[rgba(2,6,23,0.02)]">
      <table className="w-full min-w-[760px] border-collapse text-left">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.header} className="border-b border-[rgba(15,23,42,0.08)] px-3.5 py-3 text-left text-xs font-semibold text-[rgba(15,23,42,0.68)]">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="px-3.5 py-8 text-center text-[13px] text-[rgba(15,23,42,0.68)]" colSpan={columns.length}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td key={column.header} className="border-b border-[rgba(15,23,42,0.08)] px-3.5 py-3 align-middle text-[13px] text-[#0f172a]">
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function StatusPill({ status }: { status?: string | null }) {
  const safeStatus = status || "neutral";
  const labelMap: Record<string, string> = {
    overdue: "Overdue",
    due_soon: "Due soon",
    up_to_date: "Up to date",
  };
  const tone =
    safeStatus === "overdue"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : safeStatus === "due_soon"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : safeStatus === "up_to_date"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-[rgba(15,23,42,0.12)] bg-white/70 text-[rgba(15,23,42,0.68)]";

  return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}>{labelMap[safeStatus] || safeStatus}</span>;
}

function LabeledField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[13px] font-semibold text-[rgba(15,23,42,0.68)]">{label}</span>
      {children}
    </label>
  );
}

function FormSelect({
  value,
  onChange,
  children,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <select aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} className={controlClass}>
      {children}
    </select>
  );
}

function buildAdminReportsDocument({
  complianceReports,
  administeredVaccines,
  overdueRates,
}: {
  complianceReports: VaccinationComplianceReportRow[];
  administeredVaccines: MostAdministeredVaccineReportRow[];
  overdueRates: VaccinationOverdueRateReportRow[];
}) {
  const complianceRows = complianceReports.map((row) => [row.species, row.breed, row.totalpets, row.compliantpets, `${row.compliancerate}%`]);
  const vaccineRows = administeredVaccines.map((row) => [row.vaccinename, row.administrationcount]);
  const overdueRows = overdueRates.map((row) => [row.branch, row.totalplans, row.overdueplans, `${row.overduerate}%`]);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Admin Vaccination Reports</title>
  <style>
    :root {
      --text: #0f172a;
      --muted: rgba(15, 23, 42, .68);
      --line: rgba(15, 23, 42, .12);
      --panel: rgba(255, 255, 255, .76);
    }
    body {
      margin: 0;
      padding: 24px;
      color: var(--text);
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
      background: #f6f8ff;
    }
    h1 { margin: 0 0 6px; font-size: 24px; }
    p { margin: 0 0 20px; color: var(--muted); font-size: 14px; }
    section {
      border: 1px solid var(--line);
      border-radius: 16px;
      background: var(--panel);
      padding: 16px;
      margin: 0 0 16px;
      break-inside: avoid;
    }
    h2 { margin: 0 0 12px; font-size: 16px; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    th, td {
      padding: 10px 12px;
      border-bottom: 1px solid rgba(15, 23, 42, .08);
      text-align: left;
    }
    th {
      color: var(--muted);
      font-weight: 600;
    }
    @page { margin: 16mm; }
  </style>
</head>
<body>
  <h1>Admin Reports</h1>
  <p>Administrative vaccination analytics by breed, vaccine usage, and branch overdue rate.</p>
  ${printTable("Compliance by species / breed", ["Species", "Breed", "Pets", "Compliant", "Rate"], complianceRows, "No pet compliance data found.")}
  ${printTable("Most administered vaccines", ["Vaccine", "Administrations"], vaccineRows, "No vaccine administration data found.")}
  ${printTable("Overdue rates per branch", ["Branch", "Plans", "Overdue", "Rate"], overdueRows, "No branch vaccination plans found.")}
</body>
</html>`;
}

function printTable(title: string, headers: string[], rows: Array<Array<string | number>>, emptyMessage: string) {
  const bodyRows = rows.length
    ? rows.map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(String(value ?? ""))}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${headers.length}">${escapeHtml(emptyMessage)}</td></tr>`;

  return `<section>
    <h2>${escapeHtml(title)}</h2>
    <table>
      <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  </section>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
