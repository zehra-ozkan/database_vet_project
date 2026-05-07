"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { apiGet, apiSend, formatMoney } from "@/lib/api";
import { TIME_SLOTS } from "@/lib/constants";

// ── Types ─────────────────────────────────────────────────────────────────────

type BranchRow = {
  branchid: number;
  name: string;
  location: string | null;
  specialization: string | null;
};

type VetRow = {
  veterinarianid: number;
  veterinarianname: string;
  branchname: string | null;
  speciesexpertise: string | null;
  availabledates: string | null;
  rating: number | null;
};

type PetRow = {
  petid: number;
  name: string;
};

type BillRow = {
  billno: number;
  duedate: string | null;
  consultationfee: number;
  treatmentcost: number;
  medicationcost: number;
};

// Appointment type ENUM values
const APPT_TYPES = [
  { label: "Checkup", value: "CHECKUP" },
  { label: "Vaccination", value: "VACCINATION" },
  { label: "Complaint", value: "COMPLAINT" },
  { label: "Emergency", value: "EMERGENCY" },
] as const;

// ── Inner page (uses useSearchParams — must be inside Suspense) ────────────────

function BookPageInner() {
  const searchParams = useSearchParams();

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
  const [branches, setBranches] = useState<BranchRow[]>([]);               // full list, never changes
  const [allVets, setAllVets] = useState<VetRow[]>([]);                    // full list, used by booking form
  const [pets, setPets] = useState<PetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // ── Filter state (only affects Branches card + Vet table, NOT booking form) ─
  const [filterBranchId, setFilterBranchId] = useState("");
  const [filterSpecialization, setFilterSpecialization] = useState("");
  const [filterSpecies, setFilterSpecies] = useState("");
  const [filterDate, setFilterDate] = useState("");

  // ── Booking form state ──────────────────────────────────────────────────────
  const [formPetId, setFormPetId] = useState(searchParams.get("pet") ?? "");
  const [formAType, setFormAType] = useState(searchParams.get("visit") ?? "");
  const [formBranchId, setFormBranchId] = useState(searchParams.get("branch") ?? "");
  const [formVetId, setFormVetId] = useState(searchParams.get("vet") ?? "");
  const [formDate, setFormDate] = useState("");
  const [formSlot, setFormSlot] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const todayValue = new Date().toISOString().slice(0, 10);

  // ── Specialization options derived from actual DB branch data ───────────────
  const specializationOptions = useMemo(() => {
    const seen = new Set<string>();
    branches.forEach((b) => {
      if (b.specialization) {
        b.specialization.split(",").forEach((s) => {
          const trimmed = s.trim();
          if (trimmed) seen.add(trimmed);
        });
      }
    });
    return Array.from(seen).sort();
  }, [branches]);

  // ── Species options derived from actual DB values ───────────────────────────
  const speciesOptions = useMemo(() => {
    const seen = new Set<string>();
    allVets.forEach((v) => {
      if (v.speciesexpertise) {
        // speciesexpertise may be comma-separated (e.g. "Dogs, Cats")
        v.speciesexpertise.split(",").forEach((s) => {
          const trimmed = s.trim();
          if (trimmed) seen.add(trimmed);
        });
      }
    });
    return Array.from(seen).sort();
  }, [allVets]);

  // ── Derived: vets for the booking form — always from the full unfiltered list ──
  const bookingVets = useMemo(() => {
    if (!formBranchId) return allVets;
    const branch = branches.find((b) => String(b.branchid) === formBranchId);
    return allVets.filter((v) => !branch || v.branchname === branch.name);
  }, [allVets, formBranchId, branches]);

  // ── Load initial data ───────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      apiGet<BranchRow[]>("/petOwner/book/branches"),
      apiGet<VetRow[]>("/petOwner/book/vets"),
      ownerId ? apiGet<PetRow[]>("/petOwner/pets", { ownerId }) : Promise.resolve([]),
    ])
      .then(([branchData, vetData, petData]) => {
        setBranches(branchData);
        setAllVets(vetData);
        setPets(petData);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load data"))
      .finally(() => setLoading(false));
  }, [ownerId]);

  // ── Filtered vets (reactive — recalculates whenever a filter changes) ──────
  const filteredVets = useMemo(() => {
    let result = [...allVets];

    if (filterBranchId) {
      const branch = branches.find((b) => String(b.branchid) === filterBranchId);
      if (branch) {
        result = result.filter((v) => v.branchname === branch.name);
      }
    }

    if (filterSpecialization) {
      // Find branches that match the specialization, then keep vets from those branches
      const matchingBranchNames = new Set(
        branches
          .filter((b) => b.specialization?.toLowerCase().includes(filterSpecialization.toLowerCase()))
          .map((b) => b.name),
      );
      result = result.filter((v) => v.branchname && matchingBranchNames.has(v.branchname));
    }

    if (filterSpecies) {
      result = result.filter((v) =>
        v.speciesexpertise?.toLowerCase().includes(filterSpecies.toLowerCase()),
      );
    }

    if (filterDate) {
      result = result.filter((v) => v.availabledates?.includes(filterDate));
    }

    return result;
  }, [allVets, branches, filterBranchId, filterSpecialization, filterSpecies, filterDate]);

  // ── Filtered branches (reactive — recalculates whenever a filter changes) ──
  const displayedBranches = useMemo(() => {
    let shown = [...branches];

    if (filterBranchId) {
      shown = shown.filter((b) => String(b.branchid) === filterBranchId);
    }

    if (filterSpecialization) {
      shown = shown.filter((b) =>
        b.specialization?.toLowerCase().includes(filterSpecialization.toLowerCase()),
      );
    }

    // When species or date filters are active, only show branches that still have matching vets
    if (filterSpecies || filterDate) {
      const branchNamesWithVets = new Set(filteredVets.map((v) => v.branchname).filter(Boolean));
      shown = shown.filter((b) => branchNamesWithVets.has(b.name));
    }

    return shown;
  }, [branches, filteredVets, filterBranchId, filterSpecialization, filterSpecies, filterDate]);

  // ── Handle booking submit ───────────────────────────────────────────────────
  const handleBook = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formVetId || !formDate || !formSlot || !formAType) {
      setError("Please fill in all required fields including a time slot.");
      return;
    }
    if (!ownerId) {
      setError("Owner ID is missing. Please log in again.");
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccessMsg("");

    try {
      // Check unpaid bills first
      const bills = await apiGet<BillRow[]>("/petOwner/book/check-bills", { ownerId });
      if (bills.length > 0) {
        const total = bills.reduce(
          (sum, b) => sum + (b.consultationfee ?? 0) + (b.treatmentcost ?? 0) + (b.medicationcost ?? 0),
          0,
        );
        setError(
          `You have ${bills.length} unpaid bill(s) totalling ${formatMoney(total)}. Please clear them before booking.`,
        );
        return;
      }

      const apptDateTime = `${formDate} ${formSlot}:00`;

      const result = await apiSend<{ success: boolean; appointmentId: number }>(
        "/petOwner/book/create",
        "POST",
        {
          ownerId,
          petId: Number(formPetId),
          vetId: Number(formVetId),
          dateTime: apptDateTime,
          aType: formAType,
          vaccinationPlanId: null,
        },
      );

      if (result.success) {
        setSuccessMsg(`Appointment #${result.appointmentId} booked successfully for ${formDate} at ${formSlot}.`);
        setFormDate("");
        setFormSlot("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create appointment");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <section className="card">
        <p className="muted" style={{ margin: 0, fontSize: "13px" }}>
          Loading...
        </p>
      </section>
    );
  }

  return (
    <>
      <h1 className="page-title">Browse &amp; Book</h1>
      <p className="page-subtitle">
        Filter branches and veterinarians, then book an appointment. System validates conflicts, vet limits, and unpaid
        bills.
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

      {/* ── Two-column layout matching HTML reference ── */}
      <div className="book-layout mt-2">

        {/* ── LEFT column ── */}
        <div>

          {/* Filters card */}
          <div className="card" style={{ marginBottom: "20px" }}>
            <h2 style={{ fontSize: "15px", margin: "0 0 12px", fontWeight: 700 }}>Filters</h2>
            <div className="form-row">
              <div className="form-group">
                <label>Branch</label>
                <select value={filterBranchId} onChange={(e) => setFilterBranchId(e.target.value)}>
                  <option value="">All</option>
                  {branches.map((b) => (
                    <option key={b.branchid} value={b.branchid}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Specialization</label>
                <select value={filterSpecialization} onChange={(e) => setFilterSpecialization(e.target.value)}>
                  <option value="">All</option>
                  {specializationOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Species</label>
                <select value={filterSpecies} onChange={(e) => setFilterSpecies(e.target.value)}>
                  <option value="">All</option>
                  {speciesOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Date</label>
                <input
                  type="date"
                  min={todayValue}
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                />
              </div>
            </div>
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                setFilterBranchId("");
                setFilterSpecialization("");
                setFilterSpecies("");
                setFilterDate("");
              }}
            >
              Reset
            </button>
          </div>

          {/* Branches card */}
          <div className="card" style={{ marginBottom: "20px" }}>
            <h2 style={{ fontSize: "15px", margin: "0 0 12px", fontWeight: 700 }}>Branches</h2>
            {displayedBranches.length === 0 ? (
              <div className="tile">
                <p className="muted" style={{ margin: 0, fontSize: "13px" }}>
                  No branches match the selected filters.
                </p>
              </div>
            ) : (
              displayedBranches.map((b) => (
                <div key={b.branchid} className="tile">
                  <div style={{ fontWeight: 800 }}>{b.name}</div>
                  <p className="muted" style={{ margin: "4px 0", fontSize: "13px" }}>
                    {b.location ?? "No address"}
                    {b.specialization ? ` · ${b.specialization}` : ""}
                  </p>
                </div>
              ))
            )}
          </div>

          {/* Veterinarians card — columns: Name, Branch, Specialization, Species */}
          <div className="card">
            <h2 style={{ fontSize: "15px", margin: "0 0 12px", fontWeight: 700 }}>Veterinarians</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Branch</th>
                    <th>Specialization</th>
                    <th>Species</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVets.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="muted" style={{ padding: "14px 8px" }}>
                        No veterinarians found.
                      </td>
                    </tr>
                  ) : (
                    filteredVets.map((v) => {
                      const branch = branches.find((b) => b.name === v.branchname);
                      return (
                        <tr key={v.veterinarianid}>
                          <td style={{ fontWeight: 600 }}>{v.veterinarianname}</td>
                          <td>{v.branchname ?? "—"}</td>
                          <td>{branch?.specialization ?? "General"}</td>
                          <td>{v.speciesexpertise ?? "—"}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── RIGHT column: sticky booking form ── */}
        <div className="card book-form">
          <h2 style={{ fontSize: "15px", margin: "0 0 16px", fontWeight: 700 }}>Book appointment</h2>
          <form onSubmit={handleBook}>

            {/* Pet */}
            <div className="form-group">
              <label>Pet</label>
              <select value={formPetId} onChange={(e) => setFormPetId(e.target.value)} required>
                <option value="">Select pet</option>
                {pets.map((p) => (
                  <option key={p.petid} value={p.petid}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Visit type */}
            <div className="form-group">
              <label>Visit type</label>
              <select value={formAType} onChange={(e) => setFormAType(e.target.value)} required>
                <option value="">Select type</option>
                {APPT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Branch */}
            <div className="form-group">
              <label>Branch</label>
              <select
                value={formBranchId}
                onChange={(e) => {
                  setFormBranchId(e.target.value);
                  setFormVetId("");
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

            {/* Veterinarian */}
            <div className="form-group">
              <label>Veterinarian</label>
              <select value={formVetId} onChange={(e) => setFormVetId(e.target.value)} required>
                <option value="">Select vet</option>
                {bookingVets.map((v) => (
                  <option key={v.veterinarianid} value={v.veterinarianid}>
                    {v.veterinarianname}
                    {v.branchname ? ` (${v.branchname})` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Preferred date */}
            <div className="form-group">
              <label>Preferred date</label>
              <input
                type="date"
                min={todayValue}
                value={formDate}
                onChange={(e) => {
                  setFormDate(e.target.value);
                  setFormSlot("");
                }}
                required
              />
            </div>

            {/* Time slot */}
            <div className="form-group">
              <label>Time slot</label>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "6px" }}>
                {TIME_SLOTS.map((slot) => (
                  <label
                    key={slot}
                    style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "13px" }}
                  >
                    <input
                      type="radio"
                      name="slot"
                      value={slot}
                      checked={formSlot === slot}
                      onChange={() => setFormSlot(slot)}
                      disabled={!formDate}
                    />
                    {slot}
                  </label>
                ))}
              </div>
              {!formDate && (
                <p className="muted" style={{ fontSize: "12px", marginTop: "6px" }}>
                  Pick a date first to load slots
                </p>
              )}
            </div>

            <button type="submit" className="btn block" disabled={submitting}>
              {submitting ? "Booking…" : "Confirm booking"}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

// ── Page wrapper (Suspense required for useSearchParams) ──────────────────────

export default function PetOwnerBookPage() {
  return (
    <Suspense
      fallback={
        <section className="card">
          <p className="muted" style={{ margin: 0, fontSize: "13px" }}>
            Loading...
          </p>
        </section>
      }
    >
      <BookPageInner />
    </Suspense>
  );
}
