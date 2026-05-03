"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGet, apiSend, formatDate, formatMoney } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type AppointmentRow = {
  appointmentid: number;
  atype: string;
  datetime: string;
  veterinarianname: string;
  branchname: string | null;
};

type InvoiceRow = {
  billno: number;
  appointmentid: number;
  consultationfee: number;
  treatmentcost: number;
  medicationcost: number;
  duedate: string | null;
  paid: boolean;
};

type SummaryData = {
  outstandingAmount: number;
  paidThisMonth: number;
};

type FilterMode = "all" | "upcoming" | "past";

// ── Helpers ───────────────────────────────────────────────────────────────────

function invoiceTotal(row: InvoiceRow) {
  return (row.consultationfee ?? 0) + (row.treatmentcost ?? 0) + (row.medicationcost ?? 0);
}

function isUpcoming(datetime: string) {
  return new Date(datetime) > new Date();
}

function formatDateTime(datetime: string) {
  const d = new Date(datetime);
  return {
    date: new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(d),
    time: d.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit", hour12: false }),
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PetOwnerAppointmentsPage() {
  const ownerId = useMemo(() => {
    if (typeof window === "undefined") return null;
    const savedUser = localStorage.getItem("user");
    if (!savedUser) return null;
    try {
      return (JSON.parse(savedUser) as { id?: number }).id ?? null;
    } catch {
      return null;
    }
  }, []);

  // ── Data state ──────────────────────────────────────────────────────────────
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [summary, setSummary] = useState<SummaryData>({ outstandingAmount: 0, paidThisMonth: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // ── UI state ────────────────────────────────────────────────────────────────
  const [filter, setFilter] = useState<FilterMode>("all");
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [payingKey, setPayingKey] = useState<string | null>(null); // `${billNo}-${appointmentId}`

  // ── Load all data ───────────────────────────────────────────────────────────
  const loadAll = async () => {
    if (!ownerId) {
      setError("Owner ID is missing. Please log in again.");
      setLoading(false);
      return;
    }
    try {
      const [apptData, invoiceData, summaryData] = await Promise.all([
        apiGet<AppointmentRow[]>("/petOwner/appointments/list", { ownerId }),
        apiGet<InvoiceRow[]>("/petOwner/appointments/invoices", { ownerId }),
        apiGet<SummaryData>("/petOwner/appointments/summary", { ownerId }),
      ]);
      setAppointments(apptData);
      setInvoices(invoiceData);
      setSummary(summaryData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId]);

  // ── Filtered appointments ───────────────────────────────────────────────────
  const filteredAppointments = useMemo(() => {
    if (filter === "upcoming") return appointments.filter((a) => isUpcoming(a.datetime));
    if (filter === "past") return appointments.filter((a) => !isUpcoming(a.datetime));
    return appointments;
  }, [appointments, filter]);

  const upcomingCount = useMemo(
    () => appointments.filter((a) => isUpcoming(a.datetime)).length,
    [appointments],
  );

  // ── Cancel appointment ──────────────────────────────────────────────────────
  const handleCancel = async (appt: AppointmentRow) => {
    if (!ownerId) return;
    setCancellingId(appt.appointmentid);
    setError("");
    setSuccessMsg("");
    try {
      await apiSend("/petOwner/appointments/cancel", "POST", {
        ownerId,
        appointmentId: appt.appointmentid,
      });
      setSuccessMsg("Appointment cancelled successfully.");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel appointment");
    } finally {
      setCancellingId(null);
    }
  };

  // ── Pay invoice ─────────────────────────────────────────────────────────────
  const handlePay = async (inv: InvoiceRow) => {
    if (!ownerId) return;
    const key = `${inv.billno}-${inv.appointmentid}`;
    setPayingKey(key);
    setError("");
    setSuccessMsg("");
    try {
      await apiSend("/petOwner/appointments/pay-bill", "PATCH", {
        ownerId,
        billNo: inv.billno,
        appointmentId: inv.appointmentid,
      });
      setSuccessMsg(`Invoice #INV-${String(inv.billno).padStart(3, "0")} marked as paid.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not process payment");
    } finally {
      setPayingKey(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <h1 className="page-title">Appointments &amp; Billing</h1>
      <p className="page-subtitle">
        Manage appointments and invoices. Bills are generated after completed visits (consultation + treatment + medication).
      </p>

      {error ? (
        <div className="card" style={{ color: "#be123c", fontWeight: 700, marginBottom: "16px" }}>
          {error}
        </div>
      ) : null}

      {successMsg ? (
        <div className="card" style={{ color: "#059669", fontWeight: 700, marginBottom: "16px" }}>
          {successMsg}
        </div>
      ) : null}

      {/* ── KPI row ── */}
      <div className="kpi-row mb-2">
        <div className="kpi">
          <div className="label">Upcoming</div>
          <div className="value">{loading ? "—" : upcomingCount}</div>
        </div>
        <div className="kpi">
          <div className="label">Outstanding</div>
          <div className="value">{loading ? "—" : formatMoney(summary.outstandingAmount)}</div>
        </div>
        <div className="kpi">
          <div className="label">Paid this month</div>
          <div className="value">{loading ? "—" : formatMoney(summary.paidThisMonth)}</div>
        </div>
      </div>

      {loading ? (
        <section className="card">
          <p className="muted" style={{ margin: 0, fontSize: "13px" }}>Loading...</p>
        </section>
      ) : (
        <div className="app-bill-layout mt-2">
          {/* ── Appointments card ── */}
          <div className="card">
            <h2 style={{ fontSize: "16px", margin: "0 0 12px", fontWeight: 700 }}>Appointments</h2>

            <div className="form-group" style={{ maxWidth: "200px" }}>
              <label>Filter</label>
              <select value={filter} onChange={(e) => setFilter(e.target.value as FilterMode)}>
                <option value="all">All</option>
                <option value="upcoming">Upcoming</option>
                <option value="past">Past</option>
              </select>
            </div>

            <div className="table-wrap mt-1">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Vet</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAppointments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="muted" style={{ padding: "14px 8px" }}>
                        No appointments found.
                      </td>
                    </tr>
                  ) : (
                    filteredAppointments.map((appt) => {
                      const { date, time } = formatDateTime(appt.datetime);
                      const upcoming = isUpcoming(appt.datetime);
                      return (
                        <tr key={appt.appointmentid}>
                          <td>{date}</td>
                          <td>{time}</td>
                          <td>{appt.veterinarianname}</td>
                          <td style={{ textTransform: "capitalize" }}>
                            {appt.atype.charAt(0) + appt.atype.slice(1).toLowerCase()}
                          </td>
                          <td>
                            <span className={`pill ${upcoming ? "wait" : "ok"}`}>
                              {upcoming ? "Upcoming" : "Completed"}
                            </span>
                          </td>
                          <td>
                            {upcoming ? (
                              <button
                                type="button"
                                className="btn ghost"
                                style={{ fontSize: "12px", padding: "4px 10px" }}
                                disabled={cancellingId === appt.appointmentid}
                                onClick={() => handleCancel(appt)}
                              >
                                {cancellingId === appt.appointmentid ? "…" : "Cancel"}
                              </button>
                            ) : (
                              <Link
                                href={`/petOwner/appointments/${appt.appointmentid}`}
                                style={{ fontSize: "13px", color: "var(--primary)" }}
                              >
                                Summary
                              </Link>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Invoices card ── */}
          <div className="card">
            <h2 style={{ fontSize: "16px", margin: "0 0 12px", fontWeight: 700 }}>Invoices</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Due</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="muted" style={{ padding: "14px 8px" }}>
                        No invoices found.
                      </td>
                    </tr>
                  ) : (
                    invoices.map((inv) => {
                      const key = `${inv.billno}-${inv.appointmentid}`;
                      const total = invoiceTotal(inv);
                      return (
                        <tr key={key}>
                          <td style={{ fontWeight: 600 }}>
                            #INV-{String(inv.billno).padStart(3, "0")}
                          </td>
                          <td>{inv.duedate ? formatDate(inv.duedate) : "—"}</td>
                          <td>{formatMoney(total)}</td>
                          <td>
                            <span className={`pill ${inv.paid ? "ok" : "danger"}`}>
                              {inv.paid ? "Paid" : "Unpaid"}
                            </span>
                          </td>
                          <td>
                            {!inv.paid ? (
                              <button
                                type="button"
                                className="btn"
                                style={{ fontSize: "12px", padding: "4px 10px" }}
                                disabled={payingKey === key}
                                onClick={() => handlePay(inv)}
                              >
                                {payingKey === key ? "…" : "Pay"}
                              </button>
                            ) : (
                              <span style={{ fontSize: "13px", color: "var(--muted)" }}>Paid</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
