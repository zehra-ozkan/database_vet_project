"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGet, apiSend, formatDate, formatMoney } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type WelcomeData = {
  user: { userid: number; name: string; email: string; phonenumber: string } | null;
  upcomingCount: number;
  outstandingAmount: number;
};

type ChipRow = {
  petid: number;
  petname: string;
  chipid: number;
  location: string | null;
  islost: boolean;
  implantationdate: string | null;
  veterinarianname: string | null;
};

type VisitRow = {
  appointmentid: number;
  datetime: string;
  atype: string;
  veterinarianname: string;
  branchname: string | null;
  location: string | null;
};

type ActivityRow = {
  activitydate: string;
  activitytype: string;
  detail: string;
  branchname: string | null;
};

type SlotRow = {
  veterinarianid: number;
  veterinarianname: string;
  speciesexpertise: string | null;
  availabledates: string | null;
  branchname: string;
};

type BranchRow = {
  branchid: number;
  name: string;
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PetOwnerDashboardPage() {
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

  const [welcome, setWelcome] = useState<WelcomeData | null>(null);
  const [chips, setChips] = useState<ChipRow[]>([]);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Booking form
  const [bookBranchId, setBookBranchId] = useState("");
  const [bookDate, setBookDate] = useState("");
  const [findingSlots, setFindingSlots] = useState(false);
  const [slotsSearched, setSlotsSearched] = useState(false);

  // Mark-as-lost
  const [markingLost, setMarkingLost] = useState<number | null>(null);

  // ── Load dashboard data on mount ──────────────────────────────────────────

  useEffect(() => {
    if (!ownerId) {
      setError("Owner ID is missing. Please log in again.");
      setLoading(false);
      return;
    }

    Promise.all([
      apiGet<WelcomeData>("/petOwner/dashboard/welcome", { ownerId }),
      apiGet<ChipRow[]>("/petOwner/dashboard/chip-status", { ownerId }),
      apiGet<VisitRow[]>("/petOwner/dashboard/upcoming-visits", { ownerId }),
      apiGet<ActivityRow[]>("/petOwner/dashboard/activity", { ownerId }),
      apiGet<BranchRow[]>("/petOwner/branches"),
    ])
      .then(([welcomeData, chipData, visitsData, activityData, branchData]) => {
        setWelcome(welcomeData);
        setChips(chipData);
        setVisits(visitsData);
        setActivity(activityData);
        setBranches(branchData);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load dashboard"))
      .finally(() => setLoading(false));
  }, [ownerId]);

  // ── Find time slots ───────────────────────────────────────────────────────

  const handleFindSlots = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!bookBranchId || !bookDate) return;
    setFindingSlots(true);
    setSlots([]);
    setSlotsSearched(false);
    try {
      const data = await apiGet<SlotRow[]>("/petOwner/dashboard/find-slots", {
        branchId: bookBranchId,
        date: bookDate,
      });
      setSlots(data);
      setSlotsSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not fetch time slots");
    } finally {
      setFindingSlots(false);
    }
  };

  // ── Mark as lost ─────────────────────────────────────────────────────────

  const handleMarkLost = async (chip: ChipRow) => {
    if (!ownerId) return;
    setMarkingLost(chip.chipid);
    try {
      await apiSend("/petOwner/dashboard/mark-lost", "POST", {
        ownerId,
        chipId: chip.chipid,
        petId: chip.petid,
      });
      const updated = await apiGet<ChipRow[]>("/petOwner/dashboard/chip-status", { ownerId });
      setChips(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark as lost");
    } finally {
      setMarkingLost(null);
    }
  };

  // ── Derived values ────────────────────────────────────────────────────────

  const firstChip = chips[0] ?? null;
  const hasOutstanding = Number(welcome?.outstandingAmount ?? 0) > 0;
  const todayValue = new Date().toISOString().slice(0, 10);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {error ? (
        <div className="card" style={{ color: "#be123c", fontWeight: 700, marginBottom: "16px" }}>
          {error}
        </div>
      ) : null}

      {loading ? (
        <section className="card">
          <p className="muted" style={{ margin: 0, fontSize: "13px" }}>
            Loading dashboard...
          </p>
        </section>
      ) : (
        <>
          {/* ── Hero ── */}
          <section className="hero">
            {/* Left card — welcome + microchip status */}
            <div className="card">
              <h1>Welcome back, {welcome?.user?.name ?? "Pet Owner"}</h1>
              <p className="sub">
                Track your pet health across branches: appointments, prescriptions, vaccinations, bills, and microchip/lost-found records.
              </p>

              {firstChip ? (
                <div className="chip mt-2">
                  <div className="microchip" />
                  <div>
                    <div style={{ fontWeight: 800 }}>Microchip Status</div>
                    <p className="muted" style={{ margin: "4px 0 0", fontSize: "13px" }}>
                      Chip ID: <strong>{firstChip.chipid}</strong> · {firstChip.islost ? "Reported lost" : "Owner verified"}
                    </p>
                    <p className="muted" style={{ margin: "6px 0 0", fontSize: "13px" }}>
                      Pet: {firstChip.petname} · Implanted: {formatDate(firstChip.implantationdate)}
                    </p>
                    {!firstChip.islost ? (
                      <button
                        type="button"
                        className="btn ghost"
                        style={{ marginTop: "10px", fontSize: "12px", padding: "4px 12px" }}
                        disabled={markingLost === firstChip.chipid}
                        onClick={() => handleMarkLost(firstChip)}
                      >
                        {markingLost === firstChip.chipid ? "Marking…" : "Mark as Lost"}
                      </button>
                    ) : (
                      <Link
                        href="/petOwner/lost-found"
                        className="btn ghost"
                        style={{ display: "inline-block", marginTop: "10px", fontSize: "12px", padding: "4px 12px" }}
                      >
                        View Lost Report
                      </Link>
                    )}
                  </div>
                </div>
              ) : (
                <div className="chip mt-2">
                  <div className="microchip" />
                  <div>
                    <div style={{ fontWeight: 800 }}>Microchip Status</div>
                    <p className="muted" style={{ margin: "4px 0 0", fontSize: "13px" }}>No microchip registered yet.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Right card — KPIs + reminders */}
            <div className="card">
              <div className="kpi-row">
                <div className="kpi">
                  <div className="label">Upcoming</div>
                  <div className="value">{welcome?.upcomingCount ?? 0}</div>
                  <p className="muted" style={{ fontSize: "13px", margin: "6px 0 0" }}>
                    {visits.length > 0 ? `Next: ${formatDate(visits[0].datetime)}` : "No upcoming visits"}
                  </p>
                </div>
                <div className="kpi">
                  <div className="label">Outstanding</div>
                  <div className="value">{formatMoney(welcome?.outstandingAmount)}</div>
                  <p className="muted" style={{ fontSize: "13px", margin: "6px 0 0" }}>
                    {hasOutstanding ? "Pay to book" : "No pending bills"}
                  </p>
                </div>
              </div>

              <div className="form-group mt-2">
                <Link href="/petOwner/appointments" className="btn block">
                  Pay Invoice
                </Link>
              </div>

              <div className="tile mt-2">
                <div style={{ fontWeight: 700, fontSize: "13px" }}>Quick Reminders</div>
                <p className="muted" style={{ margin: "6px 0 10px", fontSize: "13px" }}>
                  {hasOutstanding && visits.length > 0
                    ? "Unpaid bill detected and upcoming appointment scheduled."
                    : hasOutstanding
                      ? "Unpaid bill detected."
                      : visits.length > 0
                        ? "Upcoming appointment scheduled."
                        : "No pending reminders."}
                </p>
                {hasOutstanding ? <span className="pill info">Billing</span> : null}
                {visits.length > 0 ? <span className="pill wait">Upcoming</span> : null}
              </div>
            </div>
          </section>

          {/* ── Panels ── */}
          <section className="panels">
            {/* Book an Appointment */}
            <div className="card panel">
              <h2>Book an Appointment</h2>
              <p className="hint">Choose branch and veterinarian</p>
              <form onSubmit={handleFindSlots}>
                <div className="form-row">
                  <div className="form-group">
                    <label>Branch</label>
                    <select
                      value={bookBranchId}
                      onChange={(e) => {
                        setBookBranchId(e.target.value);
                        setSlots([]);
                        setSlotsSearched(false);
                      }}
                      required
                    >
                      <option value="">Select branch</option>
                      {branches.map((b) => (
                        <option key={b.branchid} value={b.branchid}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Date</label>
                    <input
                      type="date"
                      min={todayValue}
                      value={bookDate}
                      onChange={(e) => {
                        setBookDate(e.target.value);
                        setSlots([]);
                        setSlotsSearched(false);
                      }}
                      required
                    />
                  </div>
                </div>
                <button className="btn block" type="submit" disabled={findingSlots}>
                  {findingSlots ? "Searching…" : "Find Time Slots"}
                </button>
              </form>

              {slots.length > 0 ? (
                <div style={{ marginTop: "14px", display: "grid", gap: "8px" }}>
                  {slots.map((slot) => (
                    <div
                      key={slot.veterinarianid}
                      className="tile"
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "13px" }}>{slot.veterinarianname}</div>
                        <p className="muted" style={{ margin: "4px 0 0", fontSize: "12px" }}>
                          {slot.branchname} · {slot.speciesexpertise ?? "General"}
                        </p>
                      </div>
                      <Link href="/petOwner/book" className="btn ghost" style={{ fontSize: "12px" }}>
                        Book
                      </Link>
                    </div>
                  ))}
                </div>
              ) : slotsSearched ? (
                <p className="muted" style={{ marginTop: "12px", fontSize: "13px" }}>
                  No available veterinarians for the selected date.
                </p>
              ) : null}
            </div>

            {/* Upcoming Visits */}
            <div className="card panel">
              <h2>Upcoming Visits</h2>
              <p className="hint">Next scheduled appointments</p>

              {visits.length === 0 ? (
                <div className="tile">
                  <p className="muted" style={{ margin: 0, fontSize: "13px" }}>
                    No upcoming appointments.
                  </p>
                </div>
              ) : (
                visits.slice(0, 5).map((visit) => (
                  <div key={visit.appointmentid} className="tile">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{formatDate(visit.datetime)}</div>
                        <p className="muted" style={{ margin: "4px 0 0", fontSize: "13px" }}>
                          {visit.veterinarianname} · {visit.branchname ?? "No branch"}
                        </p>
                      </div>
                      <span className="pill wait">Scheduled</span>
                    </div>
                  </div>
                ))
              )}

              <Link href="/petOwner/appointments" className="btn ghost block" style={{ marginTop: "12px" }}>
                Manage appointments
              </Link>
            </div>

            {/* Vaccination Tracker — full width */}
            <div className="card panel" style={{ gridColumn: "1 / -1" }}>
              <h2>Vaccination Tracker</h2>
              <p className="hint">Due soon alerts</p>
              <div className="panels" style={{ marginTop: "12px", gridTemplateColumns: "1fr 1fr" }}>
                {chips.length === 0 ? (
                  <div className="tile">
                    <p className="muted" style={{ margin: 0, fontSize: "13px" }}>
                      No vaccination data available.
                    </p>
                  </div>
                ) : (
                  chips.map((chip) => (
                    <div key={chip.chipid} className="tile">
                      <div style={{ fontWeight: 700 }}>{chip.petname}</div>
                      <p className="muted" style={{ margin: "4px 0 8px", fontSize: "13px" }}>
                        Chip registered · Implanted {formatDate(chip.implantationdate)}
                      </p>
                      <span className={`pill ${chip.islost ? "wait" : "ok"}`}>
                        {chip.islost ? "Lost" : "Active"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          {/* ── Recent Activity ── */}
          <section className="card">
            <h2 className="page-title">Recent Activity</h2>
            <p className="page-subtitle">Appointments and notes</p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Branch</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {activity.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="muted" style={{ padding: "14px 8px" }}>
                        No recent activity.
                      </td>
                    </tr>
                  ) : (
                    activity.map((row, i) => (
                      <tr key={i}>
                        <td>{formatDate(row.activitydate)}</td>
                        <td>{row.detail}</td>
                        <td>{row.branchname ?? "—"}</td>
                        <td>
                          <span className={`pill ${row.activitytype === "Bill" ? "info" : "ok"}`}>
                            {row.activitytype === "Bill" ? "Bill" : "Completed"}
                          </span>
                        </td>
                        <td>—</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
