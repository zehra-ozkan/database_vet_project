"use client";

import { FormEvent, startTransition, useEffect, useState } from "react";
import DataTable from "@/components/manager/DataTable";
import StatusBadge from "@/components/manager/StatusBadge";
import Topbar from "@/components/manager/Topbar";
import { apiGet, apiSend } from "@/lib/api";
import type { InventoryItem, SupplyLog, WasteLog } from "@/types/manager";

export default function LogsPage() {
  const [tab, setTab] = useState<"supply" | "waste">("supply");
  const [supplyLogs, setSupplyLogs] = useState<SupplyLog[]>([]);
  const [wasteLogs, setWasteLogs] = useState<WasteLog[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [showWasteForm, setShowWasteForm] = useState(false);
  const [error, setError] = useState("");

  async function loadLogs() {
    try {
      const [supply, waste, inventoryItems] = await Promise.all([
        apiGet<SupplyLog[]>("/manager/logs/supply"),
        apiGet<WasteLog[]>("/manager/logs/waste"),
        apiGet<InventoryItem[]>("/manager/inventory"),
      ]);
      setSupplyLogs(supply);
      setWasteLogs(waste);
      setInventory(inventoryItems);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load logs");
    }
  }

  useEffect(() => {
    let active = true;

    async function loadInitialLogs() {
      try {
        const [supply, waste, inventoryItems] = await Promise.all([
          apiGet<SupplyLog[]>("/manager/logs/supply"),
          apiGet<WasteLog[]>("/manager/logs/waste"),
          apiGet<InventoryItem[]>("/manager/inventory"),
        ]);
        if (active) {
          startTransition(() => {
            setSupplyLogs(supply);
            setWasteLogs(waste);
            setInventory(inventoryItems);
            setError("");
          });
        }
      } catch (err) {
        if (active) {
          startTransition(() => setError(err instanceof Error ? err.message : "Could not load logs"));
        }
      }
    }

    loadInitialLogs();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div>
      <Topbar
        title="Supply & Waste Logs"
        subtitle="Supply history is shown as current stock snapshots because the schema has no dedicated supply-log table."
        action={
          <button onClick={() => setShowWasteForm(true)} className="rounded-2xl bg-slate-800 px-4 py-3 text-sm font-bold text-white">
            Open waste form
          </button>
        }
      />

      <div className="mb-5 flex gap-3 rounded-3xl bg-white/80 p-2 shadow-sm">
        <button onClick={() => setTab("supply")} className={`rounded-2xl px-4 py-3 text-sm font-black ${tab === "supply" ? "bg-slate-800 text-white" : "text-slate-500"}`}>
          Supply Logs
        </button>
        <button onClick={() => setTab("waste")} className={`rounded-2xl px-4 py-3 text-sm font-black ${tab === "waste" ? "bg-slate-800 text-white" : "text-slate-500"}`}>
          Waste Logs
        </button>
      </div>

      {error ? <div className="mb-5 rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div> : null}

      {tab === "supply" ? (
        <DataTable
          rows={supplyLogs}
          columns={[
            { header: "Medicine", cell: (row) => <span className="font-bold text-slate-800">{row.medicinename}</span> },
            { header: "Branch", cell: (row) => row.branch },
            { header: "Current qty", cell: (row) => row.quantity },
            { header: "Threshold", cell: (row) => row.threshold },
            { header: "Notes", cell: (row) => <span className="text-slate-400">{row.notes}</span> },
          ]}
        />
      ) : (
        <DataTable
          rows={wasteLogs}
          columns={[
            { header: "Log ID", cell: (row) => row.wastelogid },
            { header: "Medicine", cell: (row) => <span className="font-bold text-slate-800">{row.medicinename}</span> },
            { header: "Branch", cell: (row) => row.branch },
            { header: "Category", cell: (row) => row.category },
            { header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
            { header: "Notes", cell: (row) => row.notes },
          ]}
        />
      )}

      {showWasteForm ? <WasteForm inventory={inventory} close={() => setShowWasteForm(false)} reload={loadLogs} /> : null}
    </div>
  );
}

function WasteForm({ inventory, close, reload }: { inventory: InventoryItem[]; close: () => void; reload: () => void }) {
  const [medicineID, setMedicineID] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await apiSend("/manager/logs/waste", "POST", { medicineID: Number(medicineID), notes });
      close();
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save waste log");
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/30 p-4">
      <form onSubmit={submit} className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-xl">
        <h2 className="text-2xl font-black text-slate-800">New Waste Log</h2>
        <select required value={medicineID} onChange={(e) => setMedicineID(e.target.value)} className="mt-5 w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-800 outline-none">
          <option value="">Choose medicine</option>
          {inventory.map((item) => (
            <option key={item.medicineid} value={item.medicineid}>
              {item.name} - {item.branch}
            </option>
          ))}
        </select>
        <textarea
          required
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-4 min-h-32 w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-800 outline-none"
          placeholder="Describe damaged, expired, or wasted medicine."
        />
        {error ? <p className="mt-3 text-sm font-semibold text-rose-600">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={close} className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700">
            Cancel
          </button>
          <button className="rounded-2xl bg-slate-800 px-4 py-3 text-sm font-bold text-white">Save log</button>
        </div>
      </form>
    </div>
  );
}
