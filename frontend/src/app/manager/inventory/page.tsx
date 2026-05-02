"use client";

import { FormEvent, startTransition, useEffect, useMemo, useState } from "react";
import DataTable from "@/components/manager/DataTable";
import { FilterSelect } from "@/components/manager/FilterBar";
import Topbar from "@/components/manager/Topbar";
import { apiGet, apiSend, formatDate } from "@/lib/api";
import type { InventoryItem, WasteLog } from "@/types/manager";

type ClinicBranch = {
  branchid: number;
  name: string;
};

type MedicineName = {
  name: string;
};

type SupplyForm = {
  branchID: string;
  medicineID: string;
  batchNumber: string;
  quantity: string;
  unitCost: string;
  expirationDate: string;
};

type ThresholdForm = {
  branchID: string;
  medicineID: string;
  threshold: string;
};

type WasteForm = {
  medicineID: string;
  notes: string;
};

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [catalogItems, setCatalogItems] = useState<InventoryItem[]>([]);
  const [branches, setBranches] = useState<ClinicBranch[]>([]);
  const [medicineNames, setMedicineNames] = useState<MedicineName[]>([]);
  const [wasteLogs, setWasteLogs] = useState<WasteLog[]>([]);
  const [filters, setFilters] = useState({ branch: "", name: "", category: "", expiry: "" });
  const [supplyForm, setSupplyForm] = useState<SupplyForm>({ branchID: "", medicineID: "", batchNumber: "", quantity: "", unitCost: "", expirationDate: "" });
  const [thresholdForm, setThresholdForm] = useState<ThresholdForm>({ branchID: "", medicineID: "", threshold: "" });
  const [wasteForm, setWasteForm] = useState<WasteForm>({ medicineID: "", notes: "" });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const medicinesForSupply = useMemo(() => filterMedicinesByBranch(catalogItems, supplyForm.branchID), [catalogItems, supplyForm.branchID]);
  const medicinesForThreshold = useMemo(() => filterMedicinesByBranch(catalogItems, thresholdForm.branchID), [catalogItems, thresholdForm.branchID]);

  async function loadInventory(active = true) {
    setLoading(true);
    try {
      const data = await apiGet<InventoryItem[]>("/manager/inventory", filters);
      if (active) {
        setItems(data);
        setError("");
      }
    } catch (err) {
      if (active) setError(err instanceof Error ? err.message : "Could not load inventory");
    } finally {
      if (active) setLoading(false);
    }
  }

  async function loadWasteLogs(active = true) {
    try {
      const data = await apiGet<WasteLog[]>("/manager/wastelog");
      if (active) setWasteLogs(data);
    } catch (err) {
      if (active) setError(err instanceof Error ? err.message : "Could not load waste logs");
    }
  }

  async function loadCatalog(active = true) {
    const data = await apiGet<InventoryItem[]>("/manager/inventory");
    if (active) setCatalogItems(data);
  }

  async function refreshData() {
    await Promise.all([loadInventory(), loadWasteLogs(), loadCatalog()]);
  }

  useEffect(() => {
    let active = true;

    async function loadInitialData() {
      try {
        const [inventoryData, wasteData, branchData, medicineNameData] = await Promise.all([
          apiGet<InventoryItem[]>("/manager/inventory"),
          apiGet<WasteLog[]>("/manager/wastelog"),
          apiGet<ClinicBranch[]>("/manager/branches"),
          apiGet<MedicineName[]>("/manager/medicine-names"),
        ]);
        if (active) {
          startTransition(() => {
            setItems(inventoryData);
            setCatalogItems(inventoryData);
            setWasteLogs(wasteData);
            setBranches(branchData);
            setMedicineNames(medicineNameData);
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

    loadInitialData();
    return () => {
      active = false;
    };
  }, []);

  async function applyFilters() {
    await loadInventory();
  }

  async function submitSupply(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");
    try {
      await apiSend("/manager/medicine/supply", "PUT", {
        branchID: Number(supplyForm.branchID),
        medicineID: Number(supplyForm.medicineID),
        quantity: Number(supplyForm.quantity),
        expirationDate: supplyForm.expirationDate,
      });
      setSupplyForm({ branchID: "", medicineID: "", batchNumber: "", quantity: "", unitCost: "", expirationDate: "" });
      setMessage("Supply logged.");
      await refreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log supply");
    }
  }

  async function submitThreshold(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");
    try {
      await apiSend("/manager/medicine/threshold", "PUT", {
        branchID: Number(thresholdForm.branchID),
        medicineID: Number(thresholdForm.medicineID),
        threshold: Number(thresholdForm.threshold),
      });
      setThresholdForm({ branchID: "", medicineID: "", threshold: "" });
      setMessage("Threshold updated.");
      await refreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update threshold");
    }
  }

  async function submitWaste(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");
    try {
      await apiSend("/manager/wastelog", "POST", {
        medicineID: Number(wasteForm.medicineID),
        notes: wasteForm.notes,
      });
      setWasteForm({ medicineID: "", notes: "" });
      setMessage("Waste log inserted.");
      await loadWasteLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not insert waste log");
    }
  }

  return (
    <div className="space-y-6">
      <Topbar
        title="Inventory management"
        subtitle="View stock per branch. Filter by medicine name, category, or expiration status. Stock usage is driven by prescriptions. Vaccines are tracked as medicines."
      />

      <section className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-sm shadow-slate-200/70">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <FilterSelect value={filters.branch} onChange={(e) => setFilters({ ...filters, branch: e.target.value })}>
            <option value="">All clinics</option>
            {branches.map((branch) => (
              <option key={branch.branchid} value={branch.branchid}>
                {branch.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect aria-label="Medicine name" value={filters.name} onChange={(e) => setFilters({ ...filters, name: e.target.value })}>
            <option value="">All medicines</option>
            {medicineNames.map((medicine) => (
              <option key={medicine.name} value={medicine.name}>
                {medicine.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
            <option value="">All categories</option>
            <option value="antibiotic">Antibiotic</option>
            <option value="analgesic">Analgesic</option>
            <option value="vaccine">Vaccine</option>
            <option value="other">Other</option>
          </FilterSelect>
          <FilterSelect aria-label="Expiration status" value={filters.expiry} onChange={(e) => setFilters({ ...filters, expiry: e.target.value })}>
            <option value="">All</option>
            <option value="valid">Valid</option>
            <option value="expired">Expired</option>
            <option value="soon">Expires within 30 days</option>
          </FilterSelect>
          <button onClick={applyFilters} className="rounded-2xl bg-slate-800 px-4 py-3 text-sm font-bold text-white">
            Apply
          </button>
        </div>
      </section>

      {error ? <div className="rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div> : null}
      {message ? <div className="rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{message}</div> : null}
      {loading ? <div className="rounded-2xl bg-white/80 p-4 text-sm font-semibold text-slate-500">Loading inventory...</div> : null}

      <DataTable
        rows={items}
        columns={[
          { header: "Medicine", cell: (row) => <span className="font-bold text-slate-800">{row.name}</span> },
          { header: "Branch", cell: (row) => row.branch },
          { header: "Quantity", cell: (row) => row.quantity },
          { header: "Threshold", cell: (row) => row.threshold },
          { header: "Expiration", cell: (row) => formatDate(row.expirydate) },
          { header: "Status", cell: (row) => <StockStatus item={row} /> },
        ]}
      />

      <section className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-sm shadow-slate-200/70">
        <h2 className="text-xl font-black text-slate-800">Log supply</h2>
        <form onSubmit={submitSupply} className="mt-5 grid gap-4 md:grid-cols-3">
          <BranchSelect value={supplyForm.branchID} branches={branches} onChange={(branchID) => setSupplyForm({ ...supplyForm, branchID, medicineID: "" })} />
          <MedicineSelect value={supplyForm.medicineID} medicines={medicinesForSupply} onChange={(medicineID) => setSupplyForm({ ...supplyForm, medicineID })} />
          <FormInput placeholder="Batch number" value={supplyForm.batchNumber} onChange={(batchNumber) => setSupplyForm({ ...supplyForm, batchNumber })} />
          <FormInput type="number" min="1" placeholder="Quantity" required value={supplyForm.quantity} onChange={(quantity) => setSupplyForm({ ...supplyForm, quantity })} />
          <FormInput type="number" min="0" step="0.01" placeholder="Unit cost" value={supplyForm.unitCost} onChange={(unitCost) => setSupplyForm({ ...supplyForm, unitCost })} />
          <FormInput type="date" required value={supplyForm.expirationDate} onChange={(expirationDate) => setSupplyForm({ ...supplyForm, expirationDate })} />
          <button className="rounded-2xl bg-slate-800 px-4 py-3 text-sm font-bold text-white md:col-span-3">Log supply</button>
        </form>
      </section>

      <section className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-sm shadow-slate-200/70">
        <h2 className="text-xl font-black text-slate-800">Stock thresholds & waste</h2>

        <h3 className="mt-5 text-sm font-black uppercase tracking-[0.18em] text-slate-400">Set minimum threshold</h3>
        <form onSubmit={submitThreshold} className="mt-5 grid gap-4 md:grid-cols-4">
          <BranchSelect value={thresholdForm.branchID} branches={branches} onChange={(branchID) => setThresholdForm({ ...thresholdForm, branchID, medicineID: "" })} />
          <MedicineSelect value={thresholdForm.medicineID} medicines={medicinesForThreshold} onChange={(medicineID) => setThresholdForm({ ...thresholdForm, medicineID })} />
          <FormInput type="number" min="0" placeholder="Minimum quantity" required value={thresholdForm.threshold} onChange={(threshold) => setThresholdForm({ ...thresholdForm, threshold })} />
          <button className="rounded-2xl bg-slate-800 px-4 py-3 text-sm font-bold text-white">Update threshold</button>
        </form>

        <div className="mt-6">
          <h3 className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-slate-400">Current thresholds</h3>
          <DataTable
            rows={items}
            columns={[
              { header: "Medicine", cell: (row) => <span className="font-bold text-slate-800">{row.name}</span> },
              { header: "Branch", cell: (row) => row.branch },
              { header: "Min threshold", cell: (row) => row.threshold },
              { header: "Current stock", cell: (row) => row.quantity },
              { header: "Status", cell: (row) => (isBelowThreshold(row) ? "Below" : "OK") },
            ]}
          />
        </div>

        <div className="mt-6">
          <h3 className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-slate-400">Waste log</h3>
          <DataTable
            rows={wasteLogs}
            columns={[
              { header: "Medicine", cell: (row) => <span className="font-bold text-slate-800">{row.medicinename}</span> },
              { header: "Notes", cell: (row) => row.notes },
            ]}
          />
        </div>

        <h3 className="mt-6 text-sm font-black uppercase tracking-[0.18em] text-slate-400">Insert waste log</h3>
        <form onSubmit={submitWaste} className="mt-6 grid gap-4 md:grid-cols-2">
          <MedicineSelect value={wasteForm.medicineID} medicines={catalogItems} onChange={(medicineID) => setWasteForm({ ...wasteForm, medicineID })} />
          <FormInput placeholder="Notes" required value={wasteForm.notes} onChange={(notes) => setWasteForm({ ...wasteForm, notes })} />
          <button className="rounded-2xl bg-slate-800 px-4 py-3 text-sm font-bold text-white md:col-span-2">Insert waste log</button>
        </form>
      </section>
    </div>
  );
}

function filterMedicinesByBranch(items: InventoryItem[], branchID: string) {
  return branchID ? items.filter((item) => String(item.branchid) === branchID) : items;
}

function isBelowThreshold(item: InventoryItem) {
  return Number(item.quantity) < Number(item.threshold);
}

function isLowStock(item: InventoryItem) {
  return Number(item.quantity) <= Number(item.threshold);
}

function StockStatus({ item }: { item: InventoryItem }) {
  const label = isLowStock(item) ? "Low" : "OK";
  const tone = isLowStock(item) ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200";
  return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}>{label}</span>;
}

function BranchSelect({ value, branches, onChange }: { value: string; branches: ClinicBranch[]; onChange: (value: string) => void }) {
  return (
    <FilterSelect required value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">All clinics</option>
      {branches.map((branch) => (
        <option key={branch.branchid} value={branch.branchid}>
          {branch.name}
        </option>
      ))}
    </FilterSelect>
  );
}

function MedicineSelect({ value, medicines, onChange }: { value: string; medicines: InventoryItem[]; onChange: (value: string) => void }) {
  return (
    <FilterSelect required value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">All medicines</option>
      {medicines.map((medicine) => (
        <option key={`${medicine.branchid}-${medicine.medicineid}`} value={medicine.medicineid}>
          {medicine.name}
        </option>
      ))}
    </FilterSelect>
  );
}

function FormInput({
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
  min,
  step,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  min?: string;
  step?: string;
}) {
  return (
    <input
      type={type}
      min={min}
      step={step}
      required={required}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-teal-300 focus:ring-4 focus:ring-teal-100"
    />
  );
}
