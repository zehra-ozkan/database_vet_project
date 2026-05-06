"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { apiGet, apiSend, formatDate } from "@/lib/api";
import { TIME_SLOTS } from "@/lib/constants";

type PetDetailResponse = {
  pet: {
    petid: number;
    name: string;
    species: string | null;
    breed: string | null;
    age: number | null;
    allergies: string | null;
    chipid: number | null;
    location: string | null;
  };
  primaryClinic: { branchname: string | null } | null;
  lastVisit: { notes: string | null; datetime: string | null } | null;
};

type VaccinationRow = {
  recordid: number;
  nextduedate: string | null;
  vaccinename: string | null;
  planid: number;
  completeddoses: number;
  totaldoses: number | null;
  planstatus: string;
};

type ActivityRow = {
  appointmentid: number;
  datetime: string | null;
  atype: string | null;
  branchname: string | null;
  status: string | null;
  notes: string | null;
};

type VaccinationPlanRow = {
  planid: number;
  nextvaccinationdate: string | null;
  petid: number;
  veterinarianid: number;
};

type RecommendedVetRow = {
  veterinarianid: number;
  veterinarianname: string;
  branchname: string | null;
  branchid: number;
  speciesexpertise: string | null;
  availabledates: string | null;
};

type AvailabilityRow = {
  appointmentid: number;
  datetime: string;
};

type BookingForm = {
  branchID: string;
  veterinarianID: string;
  preferredDate: string;
  timeSlot: string;
};

const emptyBooking: BookingForm = {
  branchID: "",
  veterinarianID: "",
  preferredDate: "",
  timeSlot: "",
};


export default function PetProfilePage() {
  const params = useParams<{ petID: string }>();
  const petID = Number(params.petID);
  const [detail, setDetail] = useState<PetDetailResponse | null>(null);
  const [vaccinations, setVaccinations] = useState<VaccinationRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [vaccinationPlans, setVaccinationPlans] = useState<VaccinationPlanRow[]>([]);
  const [recommendedVets, setRecommendedVets] = useState<RecommendedVetRow[]>([]);
  const [occupiedAppointments, setOccupiedAppointments] = useState<AvailabilityRow[]>([]);
  const [booking, setBooking] = useState<BookingForm>(emptyBooking);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

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

  const loadProfile = async () => {
    if (!ownerId || !petID) {
      setError("Owner or pet id is missing. Please log in again.");
      setLoading(false);
      return;
    }

    try {
      setError("");
      const [detailData, vaccinationRows, activityRows] = await Promise.all([
        apiGet<PetDetailResponse>(`/petOwner/pet/${petID}`, { ownerId }),
        apiGet<VaccinationRow[]>(`/petOwner/pet/${petID}/vaccinations`, { ownerId }),
        apiGet<ActivityRow[]>("/petOwner/recent-activity", { ownerId }),
      ]);
      setDetail(detailData);
      setVaccinations(vaccinationRows);
      setActivity(activityRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load pet profile");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, petID]);

  useEffect(() => {
    async function loadAvailability() {
      if (!booking.veterinarianID || !booking.preferredDate) {
        setOccupiedAppointments([]);
        return;
      }
      const rows = await apiGet<AvailabilityRow[]>("/petOwner/vet-availability", {
        veterinarianID: booking.veterinarianID,
        date: booking.preferredDate,
      });
      setOccupiedAppointments(rows);
    }

    loadAvailability().catch((err) => setError(err instanceof Error ? err.message : "Could not load occupied times"));
  }, [booking.veterinarianID, booking.preferredDate]);

  const openBookingModal = async () => {
    if (!ownerId || !petID) return;
    try {
      setError("");
      setSuccessMessage("");
      setBookingOpen(true);
      const plans = await apiGet<VaccinationPlanRow[]>(`/petOwner/vaccination-plan/${petID}`, { ownerId });
      const activePlan = plans[0] ?? null;
      const vets = await apiGet<RecommendedVetRow[]>(`/petOwner/recommended-vets/${activePlan?.planid ?? 0}`, {
        ownerId,
        petID,
      });
      const firstVet = vets[0] ?? null;
      setVaccinationPlans(plans);
      setRecommendedVets(vets);
      setOccupiedAppointments([]);
      setBooking({
        branchID: firstVet?.branchid ? String(firstVet.branchid) : "",
        veterinarianID: firstVet?.veterinarianid ? String(firstVet.veterinarianid) : "",
        preferredDate: activePlan?.nextvaccinationdate && !isPastDate(activePlan.nextvaccinationdate) ? activePlan.nextvaccinationdate : new Date().toISOString().slice(0, 10),
        timeSlot: "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load vaccination appointment options");
    }
  };

  const submitBooking = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ownerId || !detail) return;

    try {
      setSaving(true);
      setError("");
      if (isPastDate(booking.preferredDate)) {
        throw new Error("Cannot pick a past date");
      }
      if (isPastSlot(booking.preferredDate, booking.timeSlot)) {
        throw new Error("Cannot pick a past time slot");
      }
      if (isSlotOccupied(booking.timeSlot, occupiedAppointments)) {
        throw new Error("Selected time slot is already occupied");
      }

      await apiSend("/petOwner/appointments", "POST", {
        ownerId,
        petID: detail.pet.petid,
        vaccinationPlanID: vaccinationPlans[0]?.planid ?? null,
        veterinarianID: Number(booking.veterinarianID),
        dateTime: `${booking.preferredDate}T${booking.timeSlot}:00`,
      });
      setBooking(emptyBooking);
      setBookingOpen(false);
      setSuccessMessage("Vaccination appointment booked.");
      await loadProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not book vaccination");
    } finally {
      setSaving(false);
    }
  };

  const pet = detail?.pet;
  const latestActivity = activity[0] ?? null;
  const branchOptions = getUniqueBranches(recommendedVets);
  const visibleVets = booking.branchID ? recommendedVets.filter((vet) => String(vet.branchid) === booking.branchID) : recommendedVets;
  const availableSlots = TIME_SLOTS.filter((slot) => !isSlotOccupied(slot, occupiedAppointments));
  const todayValue = new Date().toISOString().slice(0, 10);

  return (
    <>
        {error ? (
          <div className="card" style={{ color: "#be123c", fontWeight: 700 }}>
            {error}
          </div>
        ) : null}
        {successMessage ? (
          <div className="card" style={{ color: "#047857", fontWeight: 700 }}>
            {successMessage}
          </div>
        ) : null}

        {loading || !pet ? (
          <section className="card">
            <p className="muted" style={{ margin: 0 }}>
              Loading pet profile...
            </p>
          </section>
        ) : (
          <>
            <section className="card">
              <h1 className="page-title">{pet.name}</h1>
              <p className="page-subtitle">
                {pet.species || "No data"} · {pet.breed || "No data"} · {pet.age ?? "No data"} years
              </p>
              <p className="muted" style={{ margin: 0, fontSize: "13px" }}>
                Microchip ID: {pet.chipid ?? "Not registered"}
              </p>
            </section>

            <section className="panels" style={{ gridTemplateColumns: "2fr 1fr" }}>
              <div className="card">
                <h2 className="page-title" style={{ fontSize: "18px" }}>
                  Profile Details
                </h2>
                <DetailRow label="Allergies" value={pet.allergies ?? "No data"} />
                <DetailRow label="Primary clinic" value={latestActivity?.branchname ?? "No clinic visits yet"} />
                <DetailRow
                  label="Last visit"
                  value={
                    latestActivity?.datetime
                      ? `${formatDate(latestActivity.datetime)} · ${latestActivity.notes ?? "No notes"}`
                      : "No visits yet"
                  }
                />
              </div>

              <div className="card">
                <h2 className="page-title" style={{ fontSize: "18px" }}>
                  Quick Actions
                </h2>
                <div style={{ display: "grid", gap: "10px" }}>
                  <button className="btn" type="button" onClick={openBookingModal}>
                    Book appointment
                  </button>
                  <Link className="btn ghost" href="/petOwner/appointments">
                    View appointments
                  </Link>
                  <a className="btn ghost" href="#microchip">
                    Microchip details
                  </a>
                </div>
              </div>
            </section>

            <section className="card">
              <h2 className="page-title" style={{ fontSize: "18px" }}>
                Vaccination Status
              </h2>
              {vaccinations.length === 0 ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  <p className="muted" style={{ margin: 0, fontSize: "14px" }}>
                    Not vaccinated yet
                  </p>
                  <div>
                    <button className="btn" type="button" onClick={openBookingModal}>
                      Book vaccination appointment
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: "rgba(15, 23, 42, 0.62)" }}>
                        <th style={{ padding: "10px 8px", borderBottom: "1px solid rgba(15, 23, 42, 0.12)" }}>Vaccine</th>
                        <th style={{ padding: "10px 8px", borderBottom: "1px solid rgba(15, 23, 42, 0.12)" }}>Dose progress</th>
                        <th style={{ padding: "10px 8px", borderBottom: "1px solid rgba(15, 23, 42, 0.12)" }}>Next due</th>
                        <th style={{ padding: "10px 8px", borderBottom: "1px solid rgba(15, 23, 42, 0.12)" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vaccinations.map((row) => {
                        const status = getVaccinationStatus(row.nextduedate, row.planstatus);
                        const progressText =
                          row.totaldoses && row.totaldoses > 0
                            ? `${row.completeddoses}/${row.totaldoses}`
                            : `${row.completeddoses}/-`;
                        return (
                          <tr key={row.planid}>
                            <td style={{ padding: "12px 8px", borderBottom: "1px solid rgba(15, 23, 42, 0.08)" }}>{row.vaccinename ?? "No data"}</td>
                            <td style={{ padding: "12px 8px", borderBottom: "1px solid rgba(15, 23, 42, 0.08)" }}>{progressText}</td>
                            <td style={{ padding: "12px 8px", borderBottom: "1px solid rgba(15, 23, 42, 0.08)" }}>{formatDate(row.nextduedate)}</td>
                            <td style={{ padding: "12px 8px", borderBottom: "1px solid rgba(15, 23, 42, 0.08)" }}>
                              {status === "Due" || status === "Due this week" || status === "Overdue" ? (
                                <button
                                  type="button"
                                  onClick={openBookingModal}
                                  style={{ appearance: "none", border: 0, background: "transparent", padding: 0, cursor: "pointer" }}
                                >
                                  <StatusBadge status={status} />
                                </button>
                              ) : (
                                <StatusBadge status={status} />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section id="microchip" className="card">
              <h2 className="page-title" style={{ fontSize: "18px" }}>
                Microchip Details
              </h2>
              <DetailRow label="Chip ID" value={pet.chipid ? String(pet.chipid) : "Not registered"} />
              <DetailRow label="Location" value={pet.location ?? "No data"} />
            </section>

            <section className="card">
              <h2 className="page-title" style={{ fontSize: "18px" }}>
                Recent Activity
              </h2>
              <p className="page-subtitle">Pet owner activity</p>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "rgba(15, 23, 42, 0.62)" }}>
                      <th style={{ padding: "10px 8px", borderBottom: "1px solid rgba(15, 23, 42, 0.12)" }}>Date</th>
                      <th style={{ padding: "10px 8px", borderBottom: "1px solid rgba(15, 23, 42, 0.12)" }}>Type</th>
                      <th style={{ padding: "10px 8px", borderBottom: "1px solid rgba(15, 23, 42, 0.12)" }}>Branch</th>
                      <th style={{ padding: "10px 8px", borderBottom: "1px solid rgba(15, 23, 42, 0.12)" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ padding: "14px 8px", color: "rgba(15, 23, 42, 0.68)" }}>
                          No visits yet
                        </td>
                      </tr>
                    ) : (
                      activity.map((row, index) => (
                        <tr key={`${row.appointmentid}-${index}`}>
                          <td style={{ padding: "12px 8px", borderBottom: "1px solid rgba(15, 23, 42, 0.08)" }}>{formatDate(row.datetime)}</td>
                          <td style={{ padding: "12px 8px", borderBottom: "1px solid rgba(15, 23, 42, 0.08)" }}>{row.atype ?? "Not set"}</td>
                          <td style={{ padding: "12px 8px", borderBottom: "1px solid rgba(15, 23, 42, 0.08)" }}>{row.branchname ?? "No clinic visits yet"}</td>
                          <td style={{ padding: "12px 8px", borderBottom: "1px solid rgba(15, 23, 42, 0.08)" }}>
                            <span className="muted">{row.status ?? "Not set"}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      {bookingOpen && pet ? (
        <div style={modalBackdropStyle}>
          <div className="card" style={modalCardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
              <h2 className="page-title" style={{ fontSize: "18px", margin: 0 }}>
                Book vaccination
              </h2>
              <button className="btn ghost" type="button" onClick={() => setBookingOpen(false)}>
                Close
              </button>
            </div>
            <form onSubmit={submitBooking} className="mt-3">
              <div className="form-group">
                <label>Pet</label>
                <input value={pet.name} readOnly />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Branch</label>
                  <select
                    value={booking.branchID}
                    onChange={(event) => {
                      const branchID = event.target.value;
                      const firstVet = recommendedVets.find((vet) => String(vet.branchid) === branchID);
                      setBooking((prev) => ({ ...prev, branchID, veterinarianID: firstVet ? String(firstVet.veterinarianid) : "", timeSlot: "" }));
                    }}
                    required
                  >
                    <option value="">Select branch</option>
                    {branchOptions.map((branch) => (
                      <option key={branch.branchid} value={branch.branchid}>
                        {branch.branchname}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Recommended vet</label>
                  <select
                    value={booking.veterinarianID}
                    onChange={(event) => setBooking((prev) => ({ ...prev, veterinarianID: event.target.value, timeSlot: "" }))}
                    required
                  >
                    <option value="">Select vet</option>
                    {visibleVets.map((vet) => (
                      <option key={vet.veterinarianid} value={vet.veterinarianid}>
                        {vet.veterinarianname}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Available date</label>
                  <input
                    type="date"
                    min={todayValue}
                    value={booking.preferredDate}
                    onChange={(event) => setBooking((prev) => ({ ...prev, preferredDate: event.target.value, timeSlot: "" }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Available time slots</label>
                  <select value={booking.timeSlot} onChange={(event) => setBooking((prev) => ({ ...prev, timeSlot: event.target.value }))} required>
                    <option value="">Select time</option>
                    {availableSlots.map((slot) => (
                      <option key={slot} value={slot} disabled={isPastSlot(booking.preferredDate, slot)}>
                        {slot}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button className="btn" type="submit" disabled={saving}>
                Confirm
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile">
      <p className="muted" style={{ margin: "0 0 4px", fontSize: "12px", fontWeight: 700 }}>
        {label}
      </p>
      <p style={{ margin: 0, fontSize: "14px", fontWeight: 700 }}>{value}</p>
    </div>
  );
}

function getVaccinationStatus(nextDueDate: string | null, planStatus?: string | null) {
  const normalizedPlanStatus = (planStatus ?? "").trim();
  if (normalizedPlanStatus) {
    return normalizedPlanStatus;
  }
  if (!nextDueDate) return "No data";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(nextDueDate);
  dueDate.setHours(0, 0, 0, 0);
  const sevenDays = new Date(today);
  sevenDays.setDate(today.getDate() + 7);
  const thirtyDays = new Date(today);
  thirtyDays.setDate(today.getDate() + 30);
  if (dueDate < today) return "Overdue";
  if (dueDate <= sevenDays) return "Due this week";
  if (dueDate <= thirtyDays) return "Due";
  return "Up to date";
}

function getUniqueBranches(vets: RecommendedVetRow[]) {
  const branchMap = new Map<number, { branchid: number; branchname: string }>();
  vets.forEach((vet) => {
    if (vet.branchid && vet.branchname) {
      branchMap.set(vet.branchid, { branchid: vet.branchid, branchname: vet.branchname });
    }
  });
  return Array.from(branchMap.values());
}

function isSlotOccupied(slot: string, appointments: AvailabilityRow[]) {
  return appointments.some((appointment) => {
    const occupiedTime = new Date(appointment.datetime).toTimeString().slice(0, 5);
    return occupiedTime === slot;
  });
}

function isPastDate(value: string) {
  if (!value) return false;
  const selected = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return selected < today;
}

function isPastSlot(dateValue: string, slot: string) {
  if (!dateValue || !slot) return false;
  return new Date(`${dateValue}T${slot}:00`) < new Date();
}

function StatusBadge({ status }: { status: string }) {
  const colors =
    status === "Overdue"
      ? { background: "rgba(225, 29, 72, 0.12)", color: "#be123c" }
      : status === "Due"
        ? { background: "rgba(250, 204, 21, 0.2)", color: "#854d0e" }
        : status === "Due this week"
        ? { background: "rgba(217, 119, 6, 0.14)", color: "#b45309" }
        : status === "Up to date"
          ? { background: "rgba(5, 150, 105, 0.12)", color: "#047857" }
          : status === "Completed"
            ? { background: "rgba(15, 23, 42, 0.12)", color: "#0f172a" }
          : { background: "rgba(15, 23, 42, 0.08)", color: "rgba(15, 23, 42, 0.62)" };
  return (
    <span style={{ ...colors, display: "inline-flex", borderRadius: "999px", padding: "5px 10px", fontWeight: 800 }}>
      {status}
    </span>
  );
}

const modalBackdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 200,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "20px",
  background: "rgba(15, 23, 42, 0.28)",
  backdropFilter: "blur(10px)",
};

const modalCardStyle: CSSProperties = {
  width: "min(680px, 100%)",
  maxHeight: "90vh",
  overflowY: "auto",
  marginBottom: 0,
};
