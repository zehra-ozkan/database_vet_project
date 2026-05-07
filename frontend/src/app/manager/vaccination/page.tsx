"use client";

import { startTransition, useEffect, useState } from "react";
import type { ReactNode } from "react";
import DataTable from "@/components/manager/DataTable";
import FilterBar, { FilterSelect } from "@/components/manager/FilterBar";
import StatusBadge from "@/components/manager/StatusBadge";
import SummaryCard from "@/components/manager/SummaryCard";
import Topbar from "@/components/manager/Topbar";
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

  return (
    <div>
      <Topbar title="Vaccination compliance" subtitle="Indicators from stored due dates and records. Upcoming/overdue vaccines highlighted." />

      <section className="mb-5 grid gap-4 md:grid-cols-3">
        <SummaryCard title="Overdue" value={summary?.overdue ?? "No data"} accent="rose" />
        <SummaryCard title="Due within 30 days" value={summary?.duewithin30days ?? "No data"} accent="sky" />
        <SummaryCard title="Up to date" value={summary?.uptodate ?? "No data"} accent="mint" />
      </section>

      <FilterBar>
        <LabeledField label="Branch">
          <FilterSelect aria-label="Clinic" value={filters.branch} onChange={(e) => setFilters({ ...filters, branch: e.target.value })}>
            <option value="">All clinics</option>
            {branches.map((branch) => (
              <option key={branch.branchid} value={branch.branchid}>
                {branch.name}
              </option>
            ))}
          </FilterSelect>
        </LabeledField>
        <LabeledField label="Status">
          <FilterSelect aria-label="Status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">All</option>
            <option value="overdue">Overdue</option>
            <option value="due_soon">Due soon</option>
            <option value="up_to_date">Up to date</option>
          </FilterSelect>
        </LabeledField>
        <button onClick={loadVaccinations} className="self-end rounded-2xl bg-slate-800 px-4 py-3 text-sm font-bold text-white">
          Apply filters
        </button>
      </FilterBar>

      {error ? <div className="mt-5 rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div> : null}

      <div className="mt-5">
        <DataTable
          rows={rows}
          columns={[
            { header: "Pet", cell: (row) => <span className="font-bold text-slate-800">{row.petname}</span> },
            { header: "Owner", cell: (row) => row.ownername },
            { header: "Vaccine", cell: (row) => row.vaccinename },
            { header: "Last date", cell: (row) => formatDate(row.lastshotdate) },
            { header: "Next due", cell: (row) => formatDate(row.nextduedate) },
            { header: "Branch", cell: (row) => row.branch },
            { header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
          ]}
        />
      </div>

      <section className="mt-5 rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-sm shadow-slate-200/70">
        <h2 className="text-xl font-black text-slate-800">Admin Reports</h2>
        <div className="mt-5 space-y-5">
          <ReportPanel title="Compliance by species / breed">
            <DataTable
              rows={complianceReports}
              emptyMessage="No pet compliance data found."
              tableClassName="min-w-full"
              columns={[
                { header: "Species", cell: (row) => <span className="font-bold text-slate-800">{row.species}</span> },
                { header: "Breed", cell: (row) => row.breed },
                { header: "Pets", cell: (row) => row.totalpets },
                { header: "Compliant", cell: (row) => row.compliantpets },
                { header: "Rate", cell: (row) => `${row.compliancerate}%` },
              ]}
            />
          </ReportPanel>
          <ReportPanel title="Most administered vaccines">
            <DataTable
              rows={administeredVaccines}
              emptyMessage="No vaccine administration data found."
              tableClassName="min-w-full"
              columns={[
                { header: "Vaccine", cell: (row) => <span className="font-bold text-slate-800">{row.vaccinename}</span> },
                { header: "Administrations", cell: (row) => row.administrationcount },
              ]}
            />
          </ReportPanel>
          <ReportPanel title="Overdue rates per branch">
            <DataTable
              rows={overdueRates}
              emptyMessage="No branch vaccination plans found."
              tableClassName="min-w-full"
              columns={[
                { header: "Branch", cell: (row) => <span className="font-bold text-slate-800">{row.branch}</span> },
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

function ReportPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3 rounded-3xl bg-slate-50/70 p-4">
      <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">{title}</h3>
      {children}
    </div>
  );
}

function LabeledField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-bold text-slate-800">{label}</span>
      {children}
    </label>
  );
}
