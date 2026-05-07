"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiGet, apiSend } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type AppointmentDetail = {
  appointmentid: number;
  datetime: string;
  atype: string;
  veterinarianid: number;
  petid: number;
  veterinarianname: string;
  branchname: string | null;
  petname: string | null;
};

type VisitSummaryData = {
  appointmentid: number;
  notes: string;
} | null;

type PrescriptionRow = {
  prescriptionid: number;
  treatment: string | null;
  prescriptiondate: string | null;
  medicineid: number;
  medicinename: string;
};

type ExistingRating = {
  rating: number;
} | null;

// ── Page ──────────────────────────────────────────────────────────────────────

export default function VisitSummaryPage() {
  const params = useParams<{ appointmentId: string }>();
  const appointmentId = Number(params.appointmentId);

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

  const [detail, setDetail] = useState<AppointmentDetail | null>(null);
  const [summary, setSummary] = useState<VisitSummaryData>(null);
  const [prescriptions, setPrescriptions] = useState<PrescriptionRow[]>([]);
  const [existingRating, setExistingRating] = useState<ExistingRating>(null);
  const [rating, setRating] = useState("5");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [submittingRating, setSubmittingRating] = useState(false);

  // ── Load all data ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ownerId || !appointmentId) {
      setError("Missing appointment or owner information.");
      setLoading(false);
      return;
    }

    Promise.all([
      apiGet<AppointmentDetail>(`/petOwner/appointments/${appointmentId}/detail`, { ownerId }),
      apiGet<VisitSummaryData>(`/petOwner/appointments/${appointmentId}/summary`),
      apiGet<PrescriptionRow[]>(`/petOwner/appointments/${appointmentId}/prescriptions`, { ownerId }),
      apiGet<ExistingRating>(`/petOwner/appointments/${appointmentId}/rating`, { ownerId }),
    ])
      .then(([detailData, summaryData, prescriptionData, ratingData]) => {
        setDetail(detailData);
        setSummary(summaryData);
        setPrescriptions(prescriptionData);
        setExistingRating(ratingData);
        if (ratingData?.rating != null) setRating(String(ratingData.rating));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load visit summary"))
      .finally(() => setLoading(false));
  }, [ownerId, appointmentId]);

  // ── Submit rating ──────────────────────────────────────────────────────────
  const handleRate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ownerId) return;
    setSubmittingRating(true);
    setError("");
    setSuccessMsg("");
    try {
      await apiSend(`/petOwner/appointments/${appointmentId}/rate`, "POST", {
        ownerId,
        rating: Number(rating),
      });
      setExistingRating({ rating: Number(rating) });
      setSuccessMsg("Rating submitted successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit rating");
    } finally {
      setSubmittingRating(false);
    }
  };

  // ── Format subtitle ───────────────────────────────────────────────────────
  const subtitle = detail
    ? [
        new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(
          new Date(detail.datetime),
        ),
        detail.petname ?? "Pet",
        detail.veterinarianname,
        detail.branchname ?? "No branch",
      ].join(" · ")
    : "";

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <section className="card">
        <p className="muted" style={{ margin: 0, fontSize: "13px" }}>Loading visit summary...</p>
      </section>
    );
  }

  if (!detail) {
    return (
      <section className="card">
        <p style={{ color: "#be123c", fontWeight: 700, margin: 0 }}>
          {error || "Appointment not found."}
        </p>
        <Link href="/petOwner/appointments" className="btn mt-2" style={{ display: "inline-block" }}>
          Back to appointments
        </Link>
      </section>
    );
  }

  return (
    <section className="card">
      <h1 className="page-title">Visit Summary</h1>
      <p className="page-subtitle">{subtitle}</p>

      {error ? (
        <div style={{ color: "#be123c", fontWeight: 700, marginBottom: "16px" }}>{error}</div>
      ) : null}

      {successMsg ? (
        <div style={{ color: "#059669", fontWeight: 700, marginBottom: "16px" }}>{successMsg}</div>
      ) : null}

      {/* ── Diagnosis & Treatment ── */}
      <div className="card" style={{ background: "rgba(255,255,255,.72)", marginBottom: "20px" }}>
        <h2 style={{ fontSize: "16px", margin: "0 0 12px" }}>Diagnosis &amp; treatment</h2>
        <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
          {summary?.notes ?? "No visit summary notes recorded for this appointment."}
        </p>
      </div>

      {/* ── Prescriptions ── */}
      <div className="card" style={{ background: "rgba(255,255,255,.72)", marginBottom: "20px" }}>
        <h2 style={{ fontSize: "16px", margin: "0 0 12px" }}>Prescriptions</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Medication</th>
                <th>Treatment</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {prescriptions.length === 0 ? (
                <tr>
                  <td colSpan={3} className="muted" style={{ padding: "14px 8px" }}>
                    No prescriptions recorded for this visit.
                  </td>
                </tr>
              ) : (
                prescriptions.map((rx) => (
                  <tr key={`${rx.prescriptionid}-${rx.medicineid}`}>
                    <td>{rx.medicinename}</td>
                    <td>{rx.treatment ?? "—"}</td>
                    <td>
                      {rx.prescriptiondate
                        ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
                            new Date(rx.prescriptiondate),
                          )
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Rate Veterinarian ── */}
      <div className="card" style={{ background: "rgba(255,255,255,.72)", marginBottom: "20px" }}>
        <h2 style={{ fontSize: "16px", margin: "0 0 12px" }}>Rate {detail.veterinarianname}</h2>
        <p className="muted" style={{ margin: "0 0 12px" }}>
          Your feedback helps other pet owners and improves our service.
        </p>

        {existingRating ? (
          <>
            <p style={{ margin: "0 0 12px", fontSize: "14px" }}>
              Your current rating: <strong>{existingRating.rating}</strong> / 10
            </p>
            <form onSubmit={handleRate}>
              <div className="form-group">
                <label>Update rating (0–10)</label>
                <select value={rating} onChange={(e) => setRating(e.target.value)}>
                  {Array.from({ length: 11 }, (_, i) => 10 - i).map((v) => (
                    <option key={v} value={v}>
                      {v}
                      {v === 10 ? " - Excellent" : v === 0 ? " - Poor" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn" disabled={submittingRating}>
                {submittingRating ? "Updating…" : "Update rating"}
              </button>
            </form>
          </>
        ) : (
          <form onSubmit={handleRate}>
            <div className="form-group">
              <label>Rating (0–10)</label>
              <select value={rating} onChange={(e) => setRating(e.target.value)}>
                {Array.from({ length: 11 }, (_, i) => 10 - i).map((v) => (
                  <option key={v} value={v}>
                    {v}
                    {v === 10 ? " - Excellent" : v === 0 ? " - Poor" : ""}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn" disabled={submittingRating}>
              {submittingRating ? "Submitting…" : "Submit rating"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
