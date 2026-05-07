"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { apiGet, apiSend, formatDate } from "@/lib/api";
import type { CostBreakdownReportRow, InventoryItem, RestockFrequencyReportRow, StockConsumptionReportRow, WasteLog, WasteStatisticsReportRow } from "@/types/manager";

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
  const [stockConsumption, setStockConsumption] = useState<StockConsumptionReportRow[]>([]);
  const [wasteStatistics, setWasteStatistics] = useState<WasteStatisticsReportRow[]>([]);
  const [restockFrequency, setRestockFrequency] = useState<RestockFrequencyReportRow[]>([]);
  const [costBreakdown, setCostBreakdown] = useState<CostBreakdownReportRow[]>([]);
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

  async function loadReports(active = true) {
    try {
      const [stockData, wasteData, restockData, costData] = await Promise.all([
        apiGet<StockConsumptionReportRow[]>("/manager/reports/stock-consumption"),
        apiGet<WasteStatisticsReportRow[]>("/manager/reports/waste-statistics"),
        apiGet<RestockFrequencyReportRow[]>("/manager/reports/restock-frequency"),
        apiGet<CostBreakdownReportRow[]>("/manager/reports/cost-breakdown"),
      ]);
      if (active) {
        setStockConsumption(stockData);
        setWasteStatistics(wasteData);
        setRestockFrequency(restockData);
        setCostBreakdown(costData);
      }
    } catch (err) {
      if (active) setError(err instanceof Error ? err.message : "Could not load inventory reports");
    }
  }

  async function refreshData() {
    await Promise.all([loadInventory(), loadWasteLogs(), loadCatalog(), loadReports()]);
  }

  useEffect(() => {
    let active = true;

    async function loadInitialData() {
      try {
        const [inventoryData, wasteData, branchData, medicineNameData, stockData, wasteReportData, restockData, costData] = await Promise.all([
          apiGet<InventoryItem[]>("/manager/inventory"),
          apiGet<WasteLog[]>("/manager/wastelog"),
          apiGet<ClinicBranch[]>("/manager/branches"),
          apiGet<MedicineName[]>("/manager/medicine-names"),
          apiGet<StockConsumptionReportRow[]>("/manager/reports/stock-consumption"),
          apiGet<WasteStatisticsReportRow[]>("/manager/reports/waste-statistics"),
          apiGet<RestockFrequencyReportRow[]>("/manager/reports/restock-frequency"),
          apiGet<CostBreakdownReportRow[]>("/manager/reports/cost-breakdown"),
        ]);
        if (active) {
          startTransition(() => {
            setItems(inventoryData);
            setCatalogItems(inventoryData);
            setWasteLogs(wasteData);
            setBranches(branchData);
            setMedicineNames(medicineNameData);
            setStockConsumption(stockData);
            setWasteStatistics(wasteReportData);
            setRestockFrequency(restockData);
            setCostBreakdown(costData);
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

  function exportReportsPdf() {
    const reportWindow = window.open("", "_blank", "width=1100,height=800");
    if (!reportWindow) {
      setError("Could not open the PDF export window. Please allow pop-ups and try again.");
      return;
    }

    reportWindow.document.write(buildReportsDocument({ stockConsumption, wasteStatistics, restockFrequency, costBreakdown }));
    reportWindow.document.close();
    reportWindow.focus();
    reportWindow.print();
  }

  return (
    <div className="space-y-4">
      <section className={sectionClass}>
        <h1 className="m-0 text-[22px] font-extrabold text-[#0f172a]">Inventory management</h1>
        <p className="m-0 mt-1.5 text-sm leading-6 text-[rgba(15,23,42,0.68)]">
          View stock per branch. Filter by medicine name, category, or expiration status. Stock usage is driven by prescriptions. Vaccines are tracked as medicines.
        </p>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <LabeledField label="Branch">
            <FormSelect value={filters.branch} onChange={(value) => setFilters({ ...filters, branch: value })}>
              <option value="">All clinics</option>
              {branches.map((branch) => (
                <option key={branch.branchid} value={branch.branchid}>
                  {branch.name}
                </option>
              ))}
            </FormSelect>
          </LabeledField>
          <LabeledField label="Medicine">
            <FormSelect ariaLabel="Medicine name" value={filters.name} onChange={(value) => setFilters({ ...filters, name: value })}>
              <option value="">All medicines</option>
              {medicineNames.map((medicine) => (
                <option key={medicine.name} value={medicine.name}>
                  {medicine.name}
                </option>
              ))}
            </FormSelect>
          </LabeledField>
          <LabeledField label="Category">
            <FormSelect value={filters.category} onChange={(value) => setFilters({ ...filters, category: value })}>
              <option value="">All categories</option>
              <option value="antibiotic">Antibiotic</option>
              <option value="analgesic">Analgesic</option>
              <option value="vaccine">Vaccine</option>
              <option value="other">Other</option>
            </FormSelect>
          </LabeledField>
          <LabeledField label="Expiration status">
            <FormSelect ariaLabel="Expiration status" value={filters.expiry} onChange={(value) => setFilters({ ...filters, expiry: value })}>
              <option value="">All</option>
              <option value="valid">Valid</option>
              <option value="expired">Expired</option>
              <option value="soon">Expires within 30 days</option>
            </FormSelect>
          </LabeledField>
          <button onClick={applyFilters} className={primaryButtonClass}>
            Apply
          </button>
        </div>

        <Feedback error={error} message={message} loading={loading} />

        <div className="mt-4">
          <ReportTable
            rows={items}
            emptyMessage="No inventory records found."
            columns={[
              { header: "Medicine", cell: (row) => <span className="font-semibold text-[#0f172a]">{row.name}</span> },
              { header: "Branch", cell: (row) => row.branch },
              { header: "Quantity", cell: (row) => row.quantity },
              { header: "Threshold", cell: (row) => row.threshold },
              { header: "Expiration", cell: (row) => formatDate(row.expirydate) },
              { header: "Status", cell: (row) => <StockStatus item={row} /> },
            ]}
          />
        </div>
      </section>

      <section className={sectionClass}>
        <h2 className="m-0 text-[22px] font-extrabold text-[#0f172a]">Log supply</h2>
        <p className="m-0 mt-1.5 text-sm text-[rgba(15,23,42,0.68)]">Record newly received stock for an existing branch medicine item.</p>
        <form onSubmit={submitSupply} className="mt-5 grid gap-4 md:grid-cols-2">
          <LabeledField label="Branch">
            <BranchSelect value={supplyForm.branchID} branches={branches} onChange={(branchID) => setSupplyForm({ ...supplyForm, branchID, medicineID: "" })} />
          </LabeledField>
          <LabeledField label="Medicine / Item">
            <MedicineSelect value={supplyForm.medicineID} medicines={medicinesForSupply} onChange={(medicineID) => setSupplyForm({ ...supplyForm, medicineID })} />
          </LabeledField>
          <LabeledField label="Batch number">
            <FormInput placeholder="Batch number" value={supplyForm.batchNumber} onChange={(batchNumber) => setSupplyForm({ ...supplyForm, batchNumber })} />
          </LabeledField>
          <LabeledField label="Quantity">
            <FormInput type="number" min="1" placeholder="Quantity" required value={supplyForm.quantity} onChange={(quantity) => setSupplyForm({ ...supplyForm, quantity })} />
          </LabeledField>
          <LabeledField label="Unit cost ($)" className="md:col-span-2">
            <FormInput type="number" min="0" step="0.01" placeholder="Unit cost" value={supplyForm.unitCost} onChange={(unitCost) => setSupplyForm({ ...supplyForm, unitCost })} />
          </LabeledField>
          <LabeledField label="Expiration date" className="md:col-span-2">
            <FormInput type="date" required value={supplyForm.expirationDate} onChange={(expirationDate) => setSupplyForm({ ...supplyForm, expirationDate })} />
          </LabeledField>
          <button className={`${primaryButtonClass} md:col-span-2`}>Log supply</button>
        </form>
      </section>

      <section className={sectionClass}>
        <h2 className="m-0 text-[22px] font-extrabold text-[#0f172a]">Stock thresholds & waste</h2>

        <h3 className={subsectionTitleClass}>Set minimum threshold</h3>
        <form onSubmit={submitThreshold} className="mt-4 grid gap-4 md:grid-cols-4">
          <LabeledField label="Branch">
            <BranchSelect value={thresholdForm.branchID} branches={branches} onChange={(branchID) => setThresholdForm({ ...thresholdForm, branchID, medicineID: "" })} />
          </LabeledField>
          <LabeledField label="Medicine">
            <MedicineSelect value={thresholdForm.medicineID} medicines={medicinesForThreshold} onChange={(medicineID) => setThresholdForm({ ...thresholdForm, medicineID })} />
          </LabeledField>
          <LabeledField label="Minimum quantity">
            <FormInput type="number" min="0" placeholder="Minimum quantity" required value={thresholdForm.threshold} onChange={(threshold) => setThresholdForm({ ...thresholdForm, threshold })} />
          </LabeledField>
          <button className={primaryButtonClass}>Update threshold</button>
        </form>

        <div className="mt-6">
          <h3 className={subsectionTitleClass}>Current thresholds</h3>
          <ReportTable
            rows={items}
            columns={[
              { header: "Medicine", cell: (row) => <span className="font-semibold text-[#0f172a]">{row.name}</span> },
              { header: "Branch", cell: (row) => row.branch },
              { header: "Min threshold", cell: (row) => row.threshold },
              { header: "Current stock", cell: (row) => row.quantity },
              { header: "Status", cell: (row) => <ThresholdStatus item={row} /> },
            ]}
          />
        </div>

        <div className="mt-6">
          <h3 className={subsectionTitleClass}>Waste log</h3>
          <ReportTable
            rows={wasteLogs}
            columns={[
              { header: "Medicine", cell: (row) => <span className="font-semibold text-[#0f172a]">{row.medicinename}</span> },
              { header: "Notes", cell: (row) => row.notes },
            ]}
          />
        </div>

        <h3 className={subsectionTitleClass}>Insert waste log</h3>
        <form onSubmit={submitWaste} className="mt-4 grid gap-4 md:grid-cols-2">
          <LabeledField label="Medicine">
            <MedicineSelect value={wasteForm.medicineID} medicines={catalogItems} onChange={(medicineID) => setWasteForm({ ...wasteForm, medicineID })} />
          </LabeledField>
          <LabeledField label="Notes">
            <FormInput placeholder="Notes" required value={wasteForm.notes} onChange={(notes) => setWasteForm({ ...wasteForm, notes })} />
          </LabeledField>
          <button className={`${primaryButtonClass} md:col-span-2`}>Insert waste log</button>
        </form>
      </section>

      <section className={sectionClass}>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="m-0 text-[22px] font-extrabold text-[#0f172a]">Inventory Reports</h2>
            <p className="m-0 mt-1.5 text-sm text-[rgba(15,23,42,0.68)]">Analytics on stock usage, waste, restocking, and cost by branch.</p>
          </div>
          <button onClick={exportReportsPdf} className={secondaryButtonClass}>
            Export all reports (PDF)
          </button>
        </div>

        <div className="mt-5 space-y-5" id="inventory-reports-section">
          <ReportPanel title="Stock consumption">
            <ReportTable
              rows={stockConsumption}
              emptyMessage="No prescription usage found."
              columns={[
                { header: "Medicine", cell: (row) => <span className="font-semibold text-[#0f172a]">{row.medicinename}</span> },
                { header: "Branch", cell: (row) => row.branch },
                { header: "Prescribed", cell: (row) => row.prescribedcount },
              ]}
            />
          </ReportPanel>
          <ReportPanel title="Waste statistics">
            <ReportTable
              rows={wasteStatistics}
              emptyMessage="No waste entries found."
              columns={[
                { header: "Medicine", cell: (row) => <span className="font-semibold text-[#0f172a]">{row.medicinename}</span> },
                { header: "Branch", cell: (row) => row.branch },
                { header: "Waste logs", cell: (row) => row.wastelogcount },
                { header: "Expired supply", cell: (row) => row.expiredsupplyrejected },
              ]}
            />
          </ReportPanel>
          <ReportPanel title="Restock frequency">
            <ReportTable
              rows={restockFrequency}
              emptyMessage="No stock increases found."
              columns={[
                { header: "Medicine", cell: (row) => <span className="font-semibold text-[#0f172a]">{row.medicinename}</span> },
                { header: "Branch", cell: (row) => row.branch },
                { header: "Successful increases", cell: (row) => row.successfulstockincreases },
                { header: "Current qty", cell: (row) => row.currentquantity },
              ]}
            />
          </ReportPanel>
          <ReportPanel title="Cost breakdown per branch">
            <ReportTable
              rows={costBreakdown}
              emptyMessage="No branch inventory found."
              columns={[
                { header: "Branch", cell: (row) => <span className="font-semibold text-[#0f172a]">{row.branch}</span> },
                { header: "Estimated inventory units", cell: (row) => row.estimatedinventoryunits },
              ]}
            />
          </ReportPanel>
        </div>
      </section>
    </div>
  );
}

const sectionClass = "rounded-[18px] border border-[rgba(15,23,42,0.12)] bg-white/75 p-5 shadow-[0_16px_45px_rgba(15,23,42,0.10)]";
const subsectionTitleClass = "mb-3 mt-6 text-sm font-extrabold text-[#0f172a]";
const primaryButtonClass = "self-end rounded-[14px] border border-[rgba(109,40,217,0.35)] bg-[linear-gradient(135deg,rgba(109,40,217,0.14),rgba(59,130,246,0.08))] px-4 py-2.5 text-sm font-semibold text-[#0f172a] transition hover:opacity-90";
const secondaryButtonClass = "rounded-[14px] border border-[rgba(109,40,217,0.35)] bg-[linear-gradient(135deg,rgba(109,40,217,0.12),rgba(59,130,246,0.07))] px-4 py-2.5 text-sm font-semibold text-[#0f172a] transition hover:opacity-90";

type ReportTableColumn<T> = {
  header: string;
  cell: (row: T) => ReactNode;
};

function filterMedicinesByBranch(items: InventoryItem[], branchID: string) {
  return branchID ? items.filter((item) => String(item.branchid) === branchID) : items;
}

function isBelowThreshold(item: InventoryItem) {
  return Number(item.quantity) < Number(item.threshold);
}

function isLowStock(item: InventoryItem) {
  return Number(item.quantity) <= Number(item.threshold);
}

function todayDateKey() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isExpired(item: InventoryItem) {
  const expiryDate = item.expirydate?.slice(0, 10);
  return Boolean(expiryDate && expiryDate < todayDateKey());
}

function StockStatus({ item }: { item: InventoryItem }) {
  const expired = isExpired(item);
  const lowStock = isLowStock(item);
  const label = expired ? "Expired" : lowStock ? "Low" : "OK";
  const tone = expired
    ? "bg-rose-50 text-rose-700 border-rose-200"
    : lowStock
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-emerald-50 text-emerald-700 border-emerald-200";
  return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}>{label}</span>;
}

function ThresholdStatus({ item }: { item: InventoryItem }) {
  return isBelowThreshold(item) ? <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">Below</span> : <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">OK</span>;
}

function Feedback({ error, message, loading }: { error: string; message: string; loading: boolean }) {
  if (!error && !message && !loading) return null;

  return (
    <div className="mt-4 grid gap-2">
      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div> : null}
      {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</div> : null}
      {loading ? <div className="rounded-2xl border border-[rgba(15,23,42,0.10)] bg-white/70 px-4 py-3 text-sm font-semibold text-[rgba(15,23,42,0.68)]">Loading inventory...</div> : null}
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

function LabeledField({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={`grid gap-1.5 ${className}`}>
      <span className="text-[13px] font-semibold text-[rgba(15,23,42,0.68)]">{label}</span>
      {children}
    </label>
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

function BranchSelect({ value, branches, onChange }: { value: string; branches: ClinicBranch[]; onChange: (value: string) => void }) {
  return (
    <FormSelect required value={value} onChange={onChange}>
      <option value="">All clinics</option>
      {branches.map((branch) => (
        <option key={branch.branchid} value={branch.branchid}>
          {branch.name}
        </option>
      ))}
    </FormSelect>
  );
}

function MedicineSelect({ value, medicines, onChange }: { value: string; medicines: InventoryItem[]; onChange: (value: string) => void }) {
  return (
    <FormSelect required value={value} onChange={onChange}>
      <option value="">All medicines</option>
      {medicines.map((medicine) => (
        <option key={`${medicine.branchid}-${medicine.medicineid}`} value={medicine.medicineid}>
          {medicine.name}
        </option>
      ))}
    </FormSelect>
  );
}

function FormSelect({
  value,
  onChange,
  children,
  required = false,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  required?: boolean;
  ariaLabel?: string;
}) {
  return (
    <select
      required={required}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={controlClass}
    >
      {children}
    </select>
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
      className={controlClass}
    />
  );
}

const controlClass = "w-full rounded-[14px] border border-[rgba(15,23,42,0.12)] bg-white/85 px-3.5 py-2.5 text-sm text-[#0f172a] outline-none transition placeholder:text-[rgba(15,23,42,0.42)] focus:border-[rgba(109,40,217,0.35)] focus:ring-4 focus:ring-violet-100";

function buildReportsDocument({
  stockConsumption,
  wasteStatistics,
  restockFrequency,
  costBreakdown,
}: {
  stockConsumption: StockConsumptionReportRow[];
  wasteStatistics: WasteStatisticsReportRow[];
  restockFrequency: RestockFrequencyReportRow[];
  costBreakdown: CostBreakdownReportRow[];
}) {
  const stockRows = stockConsumption.map((row) => [row.medicinename, row.branch, row.prescribedcount]);
  const wasteRows = wasteStatistics.map((row) => [row.medicinename, row.branch, row.wastelogcount, row.expiredsupplyrejected]);
  const restockRows = restockFrequency.map((row) => [row.medicinename, row.branch, row.successfulstockincreases, row.currentquantity]);
  const costRows = costBreakdown.map((row) => [row.branch, row.estimatedinventoryunits]);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Inventory Reports</title>
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
  <h1>Inventory Reports</h1>
  <p>Analytics on stock usage, waste, restocking, and cost by branch.</p>
  ${printTable("Stock consumption", ["Medicine", "Branch", "Prescribed"], stockRows, "No prescription usage found.")}
  ${printTable("Waste statistics", ["Medicine", "Branch", "Waste logs", "Expired supply"], wasteRows, "No waste entries found.")}
  ${printTable("Restock frequency", ["Medicine", "Branch", "Successful increases", "Current qty"], restockRows, "No stock increases found.")}
  ${printTable("Cost breakdown per branch", ["Branch", "Estimated inventory units"], costRows, "No branch inventory found.")}
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
