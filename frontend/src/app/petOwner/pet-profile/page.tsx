"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiGet, apiSend, formatDate } from "@/lib/api";
import { TIME_SLOTS } from "@/lib/constants";

type PetProfileDetails = {
  petid: number;
  name: string;
  species: string;
  breed: string;
  age: number;
  chipid: string | null;
  location: string | null;
  islost: boolean | null;
};

type AllergyRow = {
  pastdiagnosis: string;
  allergies: string;
};

type VaccinationPlanRow = {
  planid: number;
  nextvaccinationdate: string | null;
};

type VaccinationRecordRow = {
  recordid: number;
  shotdate: string;
  nextduedate: string | null;
};

type ActivityRow = {
  appointmentid: number;
  datetime: string;
  type: string;
};

type ChipDetails = {
  chipid: string;
  location: string | null;
  islost: boolean;
  implantationdate: string | null;
  veterinarianid: number | null;
};

type RecommendedVet = {
  appointmentid: number;
  veterinarianid: number;
  veterinarianname: string;
  branchname: string | null;
  speciesexpertise: string | null;
  availabledates: string | null;
};

type OccupiedSlot = {
  appointmentid: number;
  datetime: string;
  type: string;
};


function PetProfileContent() {
  const searchParams = useSearchParams();
  const petId = searchParams.get("petId");

  const [profile, setProfile] = useState<PetProfileDetails | null>(null);
  const [allergies, setAllergies] = useState<AllergyRow[]>([]);
  const [plans, setPlans] = useState<VaccinationPlanRow[]>([]);
  const [records, setRecords] = useState<VaccinationRecordRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [chipDetails, setChipDetails] = useState<ChipDetails | null>(null);
  const [chipLoading, setChipLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modal state
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [recommendedVets, setRecommendedVets] = useState<RecommendedVet[]>([]);
  const [occupiedSlots, setOccupiedSlots] = useState<OccupiedSlot[]>([]);
  const [bookingForm, setBookingForm] = useState({
    appointmentId: "",
    selectedBranch: "",
    selectedVetId: "",
    selectedDate: "",
    selectedSlot: "",
  });
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState("");

  const ownerId = useMemo(() => {
    if (typeof window === "undefined") return null;
    const savedUser = localStorage.getItem("user");
    if (!savedUser) return null;
    try {
      const user = JSON.parse(savedUser) as { id?: number };
      return user.id ?? null;
    } catch {
      return null;
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("user");
    window.location.href = "/login";
  };

  // Load selected pet profile details
  // Load allergy information of the pet
  // Load vaccination status
  // Load recent vaccination records
  // Load recent activity
  useEffect(() => {
    let active = true;

    async function loadAll() {
      try {
        if (!ownerId) throw new Error("Owner id is missing. Please log in again.");
        if (!petId) throw new Error("Pet id is missing.");

        const [profileData, allergyData, planData, recordData, activityData] = await Promise.all([
          apiGet<PetProfileDetails>(`/owner/pets/${petId}/profile`, { ownerId }),
          apiGet<AllergyRow[]>(`/owner/pets/${petId}/allergies`),
          apiGet<VaccinationPlanRow[]>(`/owner/pets/${petId}/vaccination-plans`),
          apiGet<VaccinationRecordRow[]>(`/owner/pets/${petId}/vaccination-records`),
          apiGet<ActivityRow[]>(`/owner/pets/${petId}/activity`, { ownerId }),
        ]);

        if (active) {
          setProfile(profileData);
          setAllergies(allergyData);
          setPlans(planData);
          setRecords(recordData);
          setActivity(activityData);
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Could not load pet profile");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadAll();
    return () => {
      active = false;
    };
  }, [ownerId, petId]);

  // Load microchip details
  const handleLoadChipDetails = async () => {
    if (!petId) return;
    setChipLoading(true);
    try {
      const data = await apiGet<ChipDetails>(`/owner/pets/${petId}/chip`);
      setChipDetails(data);
    } catch {
      // chip may not be registered
    } finally {
      setChipLoading(false);
    }
  };

  // Load the vaccination plan of the selected pet
  // Load recommended veterinarians for the selected vaccination plan
  useEffect(() => {
    if (!selectedPlanId || !petId) return;
    let active = true;

    async function loadBookingData() {
      try {
        const vetData = await apiGet<RecommendedVet[]>(
          `/owner/vaccination-plans/${selectedPlanId}/recommended-vets`
        );
        if (active) setRecommendedVets(vetData);
      } catch {
        // no recommended vets
      }
    }

    loadBookingData();
    return () => {
      active = false;
    };
  }, [selectedPlanId, petId]);

  // Check occupied appointment times of the selected veterinarian
  useEffect(() => {
    if (!bookingForm.selectedVetId || !bookingForm.selectedDate) return;
    let active = true;

    async function loadOccupied() {
      try {
        const data = await apiGet<OccupiedSlot[]>("/owner/appointments/occupied", {
          vetId: bookingForm.selectedVetId,
          date: bookingForm.selectedDate,
        });
        if (active) setOccupiedSlots(data);
      } catch {
        if (active) setOccupiedSlots([]);
      }
    }

    loadOccupied();
    return () => {
      active = false;
    };
  }, [bookingForm.selectedVetId, bookingForm.selectedDate]);

  const handleOpenModal = (planId: number) => {
    setSelectedPlanId(planId);
    setRecommendedVets([]);
    setOccupiedSlots([]);
    setBookingError("");
    setBookingForm({ appointmentId: "", selectedBranch: "", selectedVetId: "", selectedDate: "", selectedSlot: "" });
    dialogRef.current?.showModal();
  };

  const handleCloseModal = () => {
    dialogRef.current?.close();
    setSelectedPlanId(null);
  };

  // Create the vaccination appointment
  const handleBookingSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ownerId || !selectedPlanId) return;
    setBookingLoading(true);
    setBookingError("");
    try {
      const dateTime = `${bookingForm.selectedDate} ${bookingForm.selectedSlot}:00`;
      await apiSend("/owner/appointments/vaccination", "POST", {
        appointmentId: Number(bookingForm.appointmentId),
        dateTime,
        vaccinationPlanId: selectedPlanId,
        veterinarianId: Number(bookingForm.selectedVetId),
        petOwnerId: ownerId,
      });
      handleCloseModal();
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : "Could not book appointment");
    } finally {
      setBookingLoading(false);
    }
  };

  const today = new Date();

  const uniqueBranches = [...new Set(
    recommendedVets.map((v) => v.branchname).filter(Boolean)
  )] as string[];

  const filteredVets = bookingForm.selectedBranch
    ? recommendedVets.filter((v) => v.branchname === bookingForm.selectedBranch)
    : recommendedVets;

  const occupiedTimes = occupiedSlots.map((s) => s.datetime.slice(11, 16));
  const availableSlots = TIME_SLOTS.filter((slot) => !occupiedTimes.includes(slot));

  if (loading) return <div className="rounded-3xl bg-white/80 p-6 text-sm font-semibold text-slate-500 shadow-sm">Loading pet profile...</div>;
  if (error) return <div className="rounded-3xl bg-rose-50 p-6 text-sm font-semibold text-rose-700 shadow-sm">{error}</div>;
  if (!profile) return null;

  return (
    <div className="pet-owner">
      <div className="container">
        <header className="header-split">
          <div className="header-left">
            <Link href="/petOwner/dashboard" className="brand brand-icon" aria-label="VetChain home">
              <div className="mark" />
            </Link>
          </div>
          <div className="header-right">
            <nav className="nav nav-right">
              <Link href="/petOwner/dashboard">Dashboard</Link>
              <Link href="/petOwner/book">Book</Link>
              <Link href="/petOwner/appointments">Appointments</Link>
              <Link href="/petOwner/lost-found">Lost &amp; Found</Link>
            </nav>
            <div className="header-actions">
              <details className="profile-dropdown">
                <summary className="profile-trigger">ME</summary>
                <div className="profile-menu">
                  <Link href="/petOwner/my-pets">My Pets</Link>
                  <button type="button" onClick={handleLogout}>Logout</button>
                </div>
              </details>
            </div>
          </div>
        </header>

        {/* Section 1 – Profile summary */}
        <section className="card">
          <h1 className="page-title">{profile.name}</h1>
          <p className="page-subtitle">
            {profile.species} · {profile.breed} · {profile.age} {profile.age === 1 ? "year" : "years"}
            {profile.chipid ? ` · Microchip ${profile.chipid}` : ""}
          </p>

          <div className="panels" style={{ marginTop: "12px", gridTemplateColumns: "1.2fr .8fr" }}>
            <div className="card" style={{ background: "rgba(255,255,255,.72)" }}>
              <h2 style={{ fontSize: "16px", margin: "0 0 12px" }}>Profile details</h2>

              {allergies.length === 0 ? (
                <div className="tile">
                  <div style={{ fontWeight: 700 }}>Allergies</div>
                  <p className="muted" style={{ margin: "4px 0", fontSize: "13px" }}>No allergy records</p>
                </div>
              ) : (
                allergies.map((row, i) => (
                  <div key={i} className="tile">
                    <div style={{ fontWeight: 700 }}>Allergies</div>
                    <p className="muted" style={{ margin: "4px 0", fontSize: "13px" }}>
                      {row.allergies || "None recorded"}
                    </p>
                    <p className="muted" style={{ margin: "0", fontSize: "12px" }}>
                      Diagnosis: {row.pastdiagnosis}
                    </p>
                  </div>
                ))
              )}

              <div className="tile">
                <div style={{ fontWeight: 700 }}>Microchip</div>
                {profile.chipid ? (
                  <>
                    <p className="muted" style={{ margin: "4px 0", fontSize: "13px" }}>
                      {profile.chipid} · {profile.islost ? "Reported lost" : "Active"}
                    </p>
                    {profile.location && (
                      <p className="muted" style={{ margin: "0", fontSize: "13px" }}>{profile.location}</p>
                    )}
                    {chipDetails && (
                      <>
                        <p className="muted" style={{ margin: "4px 0 0", fontSize: "13px" }}>
                          Implanted: {formatDate(chipDetails.implantationdate)}
                        </p>
                        <p className="muted" style={{ margin: "2px 0 0", fontSize: "13px" }}>
                          Veterinarian ID: {chipDetails.veterinarianid ?? "—"}
                        </p>
                      </>
                    )}
                  </>
                ) : (
                  <p className="muted" style={{ margin: "4px 0", fontSize: "13px" }}>Not registered</p>
                )}
              </div>
            </div>

            <div className="card" style={{ background: "rgba(255,255,255,.72)" }}>
              <h2 style={{ fontSize: "16px", margin: "0 0 12px" }}>Quick actions</h2>
              <Link href="/petOwner/book" className="btn block mt-1">Book appointment</Link>
              <Link href="/petOwner/appointments" className="btn ghost block mt-1">View appointments</Link>
              <button
                type="button"
                className="btn ghost block mt-1"
                onClick={handleLoadChipDetails}
                disabled={chipLoading || !profile.chipid || chipDetails !== null}
              >
                {chipLoading ? "Loading…" : "Microchip details"}
              </button>
            </div>
          </div>
        </section>

        {/* Section 2 – Vaccination status */}
        <section className="card">
          <h2 className="page-title">Vaccination status</h2>
          <p className="page-subtitle">Upcoming and overdue alerts</p>

          {plans.length === 0 ? (
            <p className="muted" style={{ fontSize: "13px" }}>No vaccination plans on file.</p>
          ) : (
            <div className="panels" style={{ gridTemplateColumns: "1fr 1fr" }}>
              {plans.map((plan) => {
                const due = plan.nextvaccinationdate ? new Date(plan.nextvaccinationdate) : null;
                const overdue = due !== null && due < today;
                return (
                  <div key={plan.planid} className="tile">
                    <div style={{ fontWeight: 700 }}>Plan #{plan.planid}</div>
                    <p className="muted" style={{ margin: "4px 0 8px", fontSize: "13px" }}>
                      {due ? `Next due: ${formatDate(plan.nextvaccinationdate)}` : "No date set"}
                    </p>
                    {due && (
                      <span className={`pill ${overdue ? "wait" : "ok"}`}>
                        {overdue ? "Overdue" : "Upcoming"}
                      </span>
                    )}
                    {due && (
                      <button
                        type="button"
                        className="btn block mt-1"
                        onClick={() => handleOpenModal(plan.planid)}
                      >
                        Book vaccination
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {records.length > 0 && (
            <>
              <h3 style={{ fontSize: "14px", fontWeight: 700, margin: "20px 0 8px" }}>Vaccination history</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Shot date</th>
                      <th>Next due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((rec) => (
                      <tr key={rec.recordid}>
                        <td>{formatDate(rec.shotdate)}</td>
                        <td>{formatDate(rec.nextduedate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        {/* Section 3 – Recent activity */}
        <section className="card">
          <h2 className="page-title">Recent activity</h2>
          <p className="page-subtitle">Visits and notes</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {activity.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="muted">No recent appointments.</td>
                  </tr>
                ) : (
                  activity.map((appt) => (
                    <tr key={appt.appointmentid}>
                      <td>{formatDate(appt.datetime)}</td>
                      <td>{appt.type}</td>
                      <td><span className="pill wait">Scheduled</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Book vaccination modal */}
      <dialog ref={dialogRef} className="modal">
        <div className="modal-header">
          <div>
            <h2 className="page-title" style={{ marginBottom: "4px" }}>Book vaccination</h2>
            <p className="page-subtitle" style={{ marginBottom: 0 }}>Confirm details and pick a time.</p>
          </div>
          <button className="btn ghost" type="button" onClick={handleCloseModal}>Close</button>
        </div>
        <form className="modal-body" onSubmit={handleBookingSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Pet</label>
              <input type="text" value={profile.name} readOnly />
            </div>
            <div className="form-group">
              <label>Appointment ID</label>
              <input
                type="number"
                required
                placeholder="e.g. 450"
                value={bookingForm.appointmentId}
                onChange={(e) => setBookingForm((prev) => ({ ...prev, appointmentId: e.target.value }))}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Branch</label>
              <select
                required
                value={bookingForm.selectedBranch}
                onChange={(e) =>
                  setBookingForm((prev) => ({ ...prev, selectedBranch: e.target.value, selectedVetId: "", selectedSlot: "" }))
                }
              >
                <option value="">Select branch</option>
                {uniqueBranches.map((branch) => (
                  <option key={branch} value={branch}>{branch}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Recommended vet</label>
              <select
                required
                value={bookingForm.selectedVetId}
                onChange={(e) =>
                  setBookingForm((prev) => ({ ...prev, selectedVetId: e.target.value, selectedSlot: "" }))
                }
              >
                <option value="">Select vet</option>
                {filteredVets.map((vet) => (
                  <option key={vet.veterinarianid} value={String(vet.veterinarianid)}>
                    {vet.veterinarianname}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Preferred date</label>
              <input
                type="date"
                required
                value={bookingForm.selectedDate}
                onChange={(e) =>
                  setBookingForm((prev) => ({ ...prev, selectedDate: e.target.value, selectedSlot: "" }))
                }
              />
            </div>
            <div className="form-group">
              <label>Time slot</label>
              <select
                required
                value={bookingForm.selectedSlot}
                onChange={(e) => setBookingForm((prev) => ({ ...prev, selectedSlot: e.target.value }))}
              >
                <option value="">Select time</option>
                {availableSlots.map((slot) => (
                  <option key={slot} value={slot}>{slot}</option>
                ))}
              </select>
            </div>
          </div>
          {bookingError && (
            <p style={{ color: "#e11d48", fontSize: "13px", margin: "0 0 8px" }}>{bookingError}</p>
          )}
          <div className="modal-actions">
            <button className="btn ghost" type="button" onClick={handleCloseModal}>Cancel</button>
            <button className="btn" type="submit" disabled={bookingLoading}>
              {bookingLoading ? "Booking…" : "Confirm booking"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

export default function PetProfilePage() {
  return (
    <Suspense fallback={<div className="rounded-3xl bg-white/80 p-6 text-sm font-semibold text-slate-500 shadow-sm">Loading...</div>}>
      <PetProfileContent />
    </Suspense>
  );
}
