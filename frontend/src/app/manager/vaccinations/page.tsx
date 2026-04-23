"use client";

import { startTransition, useEffect, useState } from "react";
import DataTable from "@/components/manager/DataTable";
import FilterBar, { FilterInput, FilterSelect } from "@/components/manager/FilterBar";
import StatusBadge from "@/components/manager/StatusBadge";
import SummaryCard from "@/components/manager/SummaryCard";
import Topbar from "@/components/manager/Topbar";
import { apiGet, formatDate } from "@/lib/api";
import type { VaccinationRow, VaccinationSummary } from "@/types/manager";

export default function VaccinationsPage() {
  const [summary, setSummary] = useState<VaccinationSummary | null>(null);
  const [rows, setRows] = useState<VaccinationRow[]>([]);
  const [filters, setFilters] = useState({ branch: "", petName: "", species: "", breed: "", status: "", sort: "due" });
  const [error, setError] = useState("");

  async function loadVaccinations() {
    try {
      const [summaryData, rowData] = await Promise.all([
        apiGet<VaccinationSummary>("/manager/vaccinations/summary"),
        apiGet<VaccinationRow[]>("/manager/vaccinations", filters),
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
        const [summaryData, rowData] = await Promise.all([
          apiGet<VaccinationSummary>("/manager/vaccinations/summary"),
          apiGet<VaccinationRow[]>("/manager/vaccinations"),
        ]);
        if (active) {
          startTransition(() => {
            setSummary(summaryData);
            setRows(rowData);
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
      <Topbar title="Vaccination Compliance" subtitle="Review pets with overdue, upcoming, and up-to-date vaccination records." />

      <section className="mb-5 grid gap-4 md:grid-cols-4">
        <SummaryCard title="Overdue" value={summary?.overdue ?? 0} helper="Past next due date" accent="rose" />
        <SummaryCard title="Due within 30 days" value={summary?.duewithin30days ?? 0} helper="Needs scheduling soon" accent="sky" />
        <SummaryCard title="Up to date" value={summary?.uptodate ?? 0} helper="More than 30 days out" accent="mint" />
        <SummaryCard title="Compliance rate" value={`${summary?.compliancerate ?? 0}%`} helper="Not overdue" accent="peach" />
      </section>

      <FilterBar>
        <FilterSelect value={filters.branch} onChange={(e) => setFilters({ ...filters, branch: e.target.value })}>
          <option value="">All branches</option>
          <option value="1">Downtown Vet Clinic</option>
          <option value="2">Suburban Animal Hospital</option>
        </FilterSelect>
        <FilterInput placeholder="Pet name" value={filters.petName} onChange={(e) => setFilters({ ...filters, petName: e.target.value })} />
        <FilterInput placeholder="Species" value={filters.species} onChange={(e) => setFilters({ ...filters, species: e.target.value })} />
        <FilterInput placeholder="Breed" value={filters.breed} onChange={(e) => setFilters({ ...filters, breed: e.target.value })} />
        <FilterSelect value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">All statuses</option>
          <option value="overdue">Overdue</option>
          <option value="due_soon">Due soon</option>
          <option value="up_to_date">Up to date</option>
        </FilterSelect>
        <FilterSelect value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })}>
          <option value="due">Sort by due date</option>
          <option value="pet">Sort by pet</option>
          <option value="owner">Sort by owner</option>
          <option value="vet">Sort by vet</option>
        </FilterSelect>
        <button onClick={loadVaccinations} className="rounded-2xl bg-slate-800 px-4 py-3 text-sm font-bold text-white">
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
            { header: "Species/Breed", cell: (row) => `${row.species || "Unknown"} / ${row.breed || "Unknown"}` },
            { header: "Vaccine", cell: (row) => row.vaccinename },
            { header: "Last shot", cell: (row) => formatDate(row.lastshotdate) },
            { header: "Next due", cell: (row) => formatDate(row.nextduedate) },
            { header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
            { header: "Recommended vet", cell: (row) => row.recommendedvet || "Not assigned" },
            { header: "Actions", cell: () => <button className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">View</button> },
          ]}
        />
      </div>
    </div>
  );
}
