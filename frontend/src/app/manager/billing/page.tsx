"use client";

import { FormEvent, startTransition, useEffect, useState } from "react";
import DataTable from "@/components/manager/DataTable";
import StatusBadge from "@/components/manager/StatusBadge";
import SummaryCard from "@/components/manager/SummaryCard";
import Topbar from "@/components/manager/Topbar";
import { apiGet, apiSend, formatDate, formatMoney } from "@/lib/api";
import type { BillingSummary, BillRow, ReportCard } from "@/types/manager";

export default function BillingPage() {
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [bills, setBills] = useState<BillRow[]>([]);
  const [reports, setReports] = useState<ReportCard[]>([]);
  const [editingBill, setEditingBill] = useState<BillRow | null>(null);
  const [error, setError] = useState("");

  async function loadBilling() {
    try {
      const [summaryData, billData, stock, waste, vaccineRate, costs] = await Promise.all([
        apiGet<BillingSummary>("/manager/billing/summary"),
        apiGet<BillRow[]>("/manager/bills"),
        apiGet<Array<{ branch: string; prescribeditems: number; remainingstock: number }>>("/manager/reports/stock-consumption"),
        apiGet<Array<{ branch: string; wasteentries: number; damageditems: number; expireditems: number }>>("/manager/reports/waste-statistics"),
        apiGet<{ totalrecords: number; overduerecords: number; overduerate: number }>("/manager/reports/vaccination-overdue-rate"),
        apiGet<{ consultationfees: number; treatmentcosts: number; medicationcosts: number }>("/manager/reports/cost-breakdown"),
      ]);
      setSummary(summaryData);
      setBills(billData);
      setReports([
        { title: "Stock consumption by branch", value: `${stock.reduce((sum, row) => sum + Number(row.prescribeditems), 0)} prescribed`, helper: `${stock.length} branches included` },
        { title: "Waste statistics", value: `${waste.reduce((sum, row) => sum + Number(row.wasteentries), 0)} entries`, helper: "Joined from WasteLog and Medicine" },
        { title: "Overdue vaccination rate", value: `${vaccineRate.overduerate}%`, helper: `${vaccineRate.overduerecords} of ${vaccineRate.totalrecords} records` },
        { title: "Cost breakdown", value: formatMoney(Number(costs.consultationfees) + Number(costs.treatmentcosts) + Number(costs.medicationcosts)), helper: "Consultation, treatment, medication" },
      ]);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load billing data");
    }
  }

  useEffect(() => {
    let active = true;

    async function loadInitialBilling() {
      try {
        const [summaryData, billData, stock, waste, vaccineRate, costs] = await Promise.all([
          apiGet<BillingSummary>("/manager/billing/summary"),
          apiGet<BillRow[]>("/manager/bills"),
          apiGet<Array<{ branch: string; prescribeditems: number; remainingstock: number }>>("/manager/reports/stock-consumption"),
          apiGet<Array<{ branch: string; wasteentries: number; damageditems: number; expireditems: number }>>("/manager/reports/waste-statistics"),
          apiGet<{ totalrecords: number; overduerecords: number; overduerate: number }>("/manager/reports/vaccination-overdue-rate"),
          apiGet<{ consultationfees: number; treatmentcosts: number; medicationcosts: number }>("/manager/reports/cost-breakdown"),
        ]);
        if (active) {
          startTransition(() => {
            setSummary(summaryData);
            setBills(billData);
            setReports([
              { title: "Stock consumption by branch", value: `${stock.reduce((sum, row) => sum + Number(row.prescribeditems), 0)} prescribed`, helper: `${stock.length} branches included` },
              { title: "Waste statistics", value: `${waste.reduce((sum, row) => sum + Number(row.wasteentries), 0)} entries`, helper: "Joined from WasteLog and Medicine" },
              { title: "Overdue vaccination rate", value: `${vaccineRate.overduerate}%`, helper: `${vaccineRate.overduerecords} of ${vaccineRate.totalrecords} records` },
              { title: "Cost breakdown", value: formatMoney(Number(costs.consultationfees) + Number(costs.treatmentcosts) + Number(costs.medicationcosts)), helper: "Consultation, treatment, medication" },
            ]);
            setError("");
          });
        }
      } catch (err) {
        if (active) {
          startTransition(() => setError(err instanceof Error ? err.message : "Could not load billing data"));
        }
      }
    }

    loadInitialBilling();
    return () => {
      active = false;
    };
  }, []);

  async function markPaid(row: BillRow) {
    await apiSend(`/manager/bills/${row.billno}/pay`, "PATCH", {}, { appointmentID: row.appointmentid });
    loadBilling();
  }

  return (
    <div>
      <Topbar title="Billing & Reports" subtitle="Track invoices, close unpaid bills, and review simple reports generated from the existing schema." />

      <section className="mb-5 grid gap-4 md:grid-cols-4">
        <SummaryCard title="Unpaid invoices" value={summary?.unpaidinvoicescount ?? 0} helper="Bills not marked paid" accent="peach" />
        <SummaryCard title="Paid this month" value={formatMoney(summary?.paidthismonth)} helper="By due date month" accent="mint" />
        <SummaryCard title="Overdue bills" value={summary?.overduebills ?? 0} helper="Unpaid past due date" accent="rose" />
        <SummaryCard title="Average bill" value={formatMoney(summary?.averagebill)} helper="All invoices" accent="sky" />
      </section>

      {error ? <div className="mb-5 rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div> : null}

      <DataTable
        rows={bills}
        columns={[
          { header: "Bill no", cell: (row) => row.billno },
          { header: "Appointment", cell: (row) => `${row.appointmentid} - ${row.appointmenttype}` },
          { header: "Owner", cell: (row) => <span className="font-bold text-slate-800">{row.ownername}</span> },
          { header: "Total", cell: (row) => formatMoney(row.total) },
          { header: "Due date", cell: (row) => formatDate(row.duedate) },
          { header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
          {
            header: "Actions",
            cell: (row) => (
              <div className="flex flex-wrap gap-2">
                <button className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold" onClick={() => alert(`Bill ${row.billno}\nOwner: ${row.ownername}\nTotal: ${formatMoney(row.total)}`)}>
                  View bill
                </button>
                <button disabled={row.paid} onClick={() => markPaid(row)} className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 disabled:opacity-40">
                  Mark paid
                </button>
                <button onClick={() => setEditingBill(row)} className="rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700">
                  Edit due date
                </button>
              </div>
            ),
          },
        ]}
      />

      <section className="mt-6 grid gap-4 md:grid-cols-4">
        {reports.map((report) => (
          <SummaryCard key={report.title} title={report.title} value={report.value} helper={report.helper} accent="mint" />
        ))}
      </section>

      {editingBill ? <DueDateModal bill={editingBill} close={() => setEditingBill(null)} reload={loadBilling} /> : null}
    </div>
  );
}

function DueDateModal({ bill, close, reload }: { bill: BillRow; close: () => void; reload: () => void }) {
  const [dueDate, setDueDate] = useState(bill.duedate || "");
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await apiSend(`/manager/bills/${bill.billno}/due-date`, "PATCH", { dueDate }, { appointmentID: bill.appointmentid });
      close();
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update due date");
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/30 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
        <h2 className="text-2xl font-black text-slate-800">Edit Due Date</h2>
        <p className="mt-2 text-sm text-slate-500">Bill {bill.billno}</p>
        <input type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-5 w-full rounded-2xl border border-slate-200 px-4 py-3 text-slate-800 outline-none" />
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
