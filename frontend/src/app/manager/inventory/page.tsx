"use client";

import { FormEvent, startTransition, useEffect, useState } from "react";
import DataTable from "@/components/manager/DataTable";
import FilterBar, { FilterInput, FilterSelect } from "@/components/manager/FilterBar";
import StatusBadge from "@/components/manager/StatusBadge";
import SummaryCard from "@/components/manager/SummaryCard";
import Topbar from "@/components/manager/Topbar";
import { apiGet, apiSend, formatDate } from "@/lib/api";
import type { InventoryItem } from "@/types/manager";

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [filters, setFilters] = useState({ branch: "", name: "", category: "", status: "", expiry: "", sort: "name" });
  const [modal, setModal] = useState<{ type: "supply" | "threshold" | null; item?: InventoryItem }>({ type: null });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadInventory() {
    setLoading(true);
    try {
      setItems(await apiGet<InventoryItem[]>("/manager/inventory", filters));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load inventory");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function loadInitialInventory() {
      try {
        const data = await apiGet<InventoryItem[]>("/manager/inventory");
        if (active) {
          startTransition(() => {
            setItems(data);
            setError("");
            setLoading(false);
          });
        }
      } catch (err) {
        if (active) {
          startTransition(() => {
            setError(err instanceof Error ? err.message : "Could not load inventory");
            setLoading(false);
          });
        }
      }
    }

    loadInitialInventory();
    return () => {
      active = false;
    };
  }, []);

  const lowStockCount = items.filter((item) => item.displaystatus === "low_stock").length;
  const issueCount = items.filter((item) => item.status === "damaged" || item.status === "expired").length;

  return (
    <div>
      <Topbar title="Inventory Management" subtitle="Filter medicine stock, tune thresholds, and record simple schema-compatible supply updates." />

      <section className="mb-5 grid gap-4 md:grid-cols-3">
        <SummaryCard title="Total medicines" value={items.length} helper="Across all branches" accent="mint" />
        <SummaryCard title="Low stock" value={lowStockCount} helper="Quantity at threshold" accent="peach" />
        <SummaryCard title="Damaged/expired" value={issueCount} helper="Marked by manager" accent="rose" />
      </section>

      <FilterBar>
        <FilterSelect value={filters.branch} onChange={(e) => setFilters({ ...filters, branch: e.target.value })}>
          <option value="">All branches</option>
          <option value="1">Downtown Vet Clinic</option>
          <option value="2">Suburban Animal Hospital</option>
        </FilterSelect>
        <FilterInput placeholder="Medicine name" value={filters.name} onChange={(e) => setFilters({ ...filters, name: e.target.value })} />
        <FilterSelect value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
          <option value="">All categories</option>
          <option value="antibiotic">Antibiotic</option>
          <option value="analgesic">Analgesic</option>
          <option value="vaccine">Vaccine</option>
          <option value="other">Other</option>
        </FilterSelect>
        <FilterSelect value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">All statuses</option>
          <option value="safe">Safe</option>
          <option value="low_stock">Low stock</option>
          <option value="damaged">Damaged</option>
          <option value="expired">Expired</option>
        </FilterSelect>
        <FilterSelect value={filters.expiry} onChange={(e) => setFilters({ ...filters, expiry: e.target.value })}>
          <option value="">Any expiry</option>
          <option value="soon">Expires within 30 days</option>
          <option value="expired">Expired by date</option>
        </FilterSelect>
        <FilterSelect value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })}>
          <option value="name">Sort by name</option>
          <option value="quantity">Sort by quantity</option>
          <option value="expiry">Sort by expiry</option>
          <option value="branch">Sort by branch</option>
        </FilterSelect>
        <button onClick={loadInventory} className="rounded-2xl bg-slate-800 px-4 py-3 text-sm font-bold text-white">
          Apply filters
        </button>
      </FilterBar>

      {error ? <div className="mt-5 rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div> : null}
      {loading ? <div className="mt-5 rounded-2xl bg-white/80 p-4 text-sm font-semibold text-slate-500">Loading inventory...</div> : null}

      <div className="mt-5">
        <DataTable
          rows={items}
          columns={[
            { header: "ID", cell: (row) => row.medicineid },
            { header: "Name", cell: (row) => <span className="font-bold text-slate-800">{row.name}</span> },
            { header: "Category", cell: (row) => row.category },
            { header: "Branch", cell: (row) => row.branch },
            { header: "Qty", cell: (row) => row.quantity },
            { header: "Threshold", cell: (row) => row.threshold },
            { header: "Expiry", cell: (row) => formatDate(row.expirydate) },
            { header: "Status", cell: (row) => <StatusBadge status={row.displaystatus || row.status} /> },
            {
              header: "Actions",
              cell: (row) => (
                <div className="flex flex-wrap gap-2">
                  <button className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold" onClick={() => alert(`${row.name}\n${row.branch}\nQuantity: ${row.quantity}`)}>
                    View
                  </button>
                  <button className="rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-700" onClick={() => setModal({ type: "threshold", item: row })}>
                    Edit threshold
                  </button>
                  <button className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700" onClick={() => setModal({ type: "supply", item: row })}>
                    Log supply
                  </button>
                  <button className="rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700" onClick={() => markStatus(row, "damaged")}>
                    Mark damaged
                  </button>
                  <button className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-700" onClick={() => markStatus(row, "expired")}>
                    Mark expired
                  </button>
                </div>
              ),
            },
          ]}
        />
      </div>

      {modal.type && modal.item ? <InventoryModal modal={modal} close={() => setModal({ type: null })} reload={loadInventory} /> : null}
    </div>
  );

  async function markStatus(item: InventoryItem, status: "damaged" | "expired") {
    await apiSend(`/manager/inventory/${item.medicineid}/status`, "PATCH", {
      status,
      notes: `${item.name} marked ${status} from manager inventory page.`,
    });
    loadInventory();
  }
}

function InventoryModal({ modal, close, reload }: { modal: { type: "supply" | "threshold" | null; item?: InventoryItem }; close: () => void; reload: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const item = modal.item;
  if (!item) return null;
  const selectedItem = item;

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      if (modal.type === "supply") {
        await apiSend("/manager/inventory/supply", "POST", { medicineID: selectedItem.medicineid, quantity: Number(value) });
      } else {
        await apiSend(`/manager/inventory/${selectedItem.medicineid}/threshold`, "PATCH", { threshold: Number(value) });
      }
      close();
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/30 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
        <h2 className="text-2xl font-black text-slate-800">{modal.type === "supply" ? "Log Supply" : "Edit Threshold"}</h2>
        <p className="mt-2 text-sm text-slate-500">{selectedItem.name}</p>
        <input
          type="number"
          min="1"
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mt-5 w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-800 outline-none focus:ring-4 focus:ring-teal-100"
          placeholder={modal.type === "supply" ? "Quantity to add" : "New threshold"}
        />
        {error ? <p className="mt-3 text-sm font-semibold text-rose-600">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={close} className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700">
            Cancel
          </button>
          <button className="rounded-2xl bg-slate-800 px-4 py-3 text-sm font-bold text-white">Save</button>
        </div>
      </form>
    </div>
  );
}
