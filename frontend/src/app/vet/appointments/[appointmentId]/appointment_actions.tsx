"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "../../dashboard/vet_dashboard_page.module.css";

type MedicineOption = {
  medicineid: number;
  name: string;
  quantity: number | null;
  status: string | null;
};

type ReferralTarget = {
  veterinarianid: number;
  veterinarian_name: string;
  branch_name: string;
};

type AppointmentActionsProps = {
  appointmentId: number;
  vetId: number;
  selectedPetId: number | null;
  defaultVisitNotes: string;
  defaultAppointmentDateTime: string;
  isCompleted: boolean;
  medicines: MedicineOption[];
  referralTargets: ReferralTarget[];
};

const clientApiBaseCandidates = Array.from(
  new Set(
    [process.env.NEXT_PUBLIC_API_URL, "http://localhost:5000/api"]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.replace(/\/$/, ""))
  )
);

function buildErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const errorValue = (payload as { error?: unknown }).error;
    if (typeof errorValue === "string") {
      return errorValue;
    }
  }
  return `HTTP ${status}`;
}

async function postVetAction<T>(
  endpoint: string,
  payload: Record<string, unknown>
): Promise<{ data: T | null; error: string | null }> {
  let lastError = "Request failed.";

  for (const apiBase of clientApiBaseCandidates) {
    try {
      const response = await fetch(`${apiBase}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const responsePayload = (await response.json()) as T & { error?: string };
      if (!response.ok) {
        lastError = buildErrorMessage(responsePayload, response.status);
        continue;
      }
      return { data: responsePayload, error: null };
    } catch (error) {
      if (error instanceof Error) {
        lastError = error.message;
      }
    }
  }

  return { data: null, error: lastError };
}

export default function AppointmentActions({
  appointmentId,
  vetId,
  selectedPetId,
  defaultVisitNotes,
  defaultAppointmentDateTime,
  isCompleted,
  medicines,
  referralTargets,
}: AppointmentActionsProps) {
  const router = useRouter();
  const [visitNotes, setVisitNotes] = useState(defaultVisitNotes);
  const [isCompletedLocal, setIsCompletedLocal] = useState(isCompleted);
  const [visitMessage, setVisitMessage] = useState<string | null>(null);
  const [visitError, setVisitError] = useState<string | null>(null);
  const [visitSaving, setVisitSaving] = useState(false);

  const [treatment, setTreatment] = useState("");
  const [selectedMedicineIds, setSelectedMedicineIds] = useState<number[]>([]);
  const [prescriptionMessage, setPrescriptionMessage] = useState<string | null>(null);
  const [prescriptionError, setPrescriptionError] = useState<string | null>(null);
  const [prescriptionSaving, setPrescriptionSaving] = useState(false);

  const [refereeVetId, setRefereeVetId] = useState<number | null>(
    referralTargets.length > 0 ? referralTargets[0].veterinarianid : null
  );
  const [referralDiagnosis, setReferralDiagnosis] = useState("");
  const [referralMessage, setReferralMessage] = useState<string | null>(null);
  const [referralError, setReferralError] = useState<string | null>(null);
  const [referralSaving, setReferralSaving] = useState(false);

  const [consultationFee, setConsultationFee] = useState("0");
  const [treatmentCost, setTreatmentCost] = useState("0");
  const [medicationCost, setMedicationCost] = useState("0");
  const [dueDate, setDueDate] = useState("");
  const [completionMessage, setCompletionMessage] = useState<string | null>(null);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [completionSaving, setCompletionSaving] = useState(false);
  const [appointmentDateTime, setAppointmentDateTime] = useState(defaultAppointmentDateTime);
  const [rescheduleMessage, setRescheduleMessage] = useState<string | null>(null);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [rescheduleSaving, setRescheduleSaving] = useState(false);

  const availableSelectableMedicines = useMemo(
    () => medicines.filter((medicine) => (medicine.quantity ?? 0) > 0),
    [medicines]
  );
  const actionsLocked = isCompletedLocal;

  const parseNonNegativeNumber = (value: string, label: string): { value: number | null; error: string | null } => {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return { value: null, error: `${label} must be a non-negative number.` };
    }
    return { value: parsed, error: null };
  };

  const toggleMedicine = (medicineId: number) => {
    setSelectedMedicineIds((previous) => {
      if (previous.includes(medicineId)) {
        return previous.filter((value) => value !== medicineId);
      }
      return [...previous, medicineId];
    });
  };

  const submitVisitSummary = async (event: FormEvent) => {
    event.preventDefault();
    if (actionsLocked) {
      setVisitError("Appointment is already completed. Visit summary is locked.");
      return;
    }

    const normalizedNotes = visitNotes.trim();
    if (!normalizedNotes) {
      setVisitError("Visit summary notes are required.");
      return;
    }

    setVisitError(null);
    setVisitMessage(null);
    setVisitSaving(true);

    const { error } = await postVetAction(`/vet/appointments/${appointmentId}/visit-summary`, {
      vetId,
      notes: normalizedNotes,
    });

    setVisitSaving(false);
    if (error) {
      setVisitError(error);
      return;
    }
    setVisitMessage("Visit summary saved.");
    router.refresh();
  };

  const submitPrescription = async (event: FormEvent) => {
    event.preventDefault();
    if (actionsLocked) {
      setPrescriptionError("Appointment is already completed. Prescription is locked.");
      return;
    }
    if (!selectedPetId) {
      setPrescriptionError("Select a pet before creating a prescription.");
      return;
    }

    const normalizedTreatment = treatment.trim();
    if (!normalizedTreatment) {
      setPrescriptionError("Treatment is required.");
      return;
    }

    setPrescriptionError(null);
    setPrescriptionMessage(null);
    setPrescriptionSaving(true);

    const { error } = await postVetAction(`/vet/appointments/${appointmentId}/prescriptions`, {
      vetId,
      petId: selectedPetId,
      treatment: normalizedTreatment,
      medicineIds: selectedMedicineIds,
    });

    setPrescriptionSaving(false);
    if (error) {
      setPrescriptionError(error);
      return;
    }

    setPrescriptionMessage("Prescription saved.");
    setTreatment("");
    setSelectedMedicineIds([]);
    router.refresh();
  };

  const submitReferral = async (event: FormEvent) => {
    event.preventDefault();
    if (actionsLocked) {
      setReferralError("Appointment is already completed. Referral is locked.");
      return;
    }
    if (!refereeVetId) {
      setReferralError("Select a referee veterinarian.");
      return;
    }

    const normalizedDiagnosis = referralDiagnosis.trim();
    if (!normalizedDiagnosis) {
      setReferralError("Referral diagnosis is required.");
      return;
    }

    setReferralError(null);
    setReferralMessage(null);
    setReferralSaving(true);

    const { error } = await postVetAction("/vet/referrals", {
      vetId,
      refereeVetId,
      diagnosis: normalizedDiagnosis,
    });

    setReferralSaving(false);
    if (error) {
      setReferralError(error);
      return;
    }

    setReferralMessage("Referral created.");
    setReferralDiagnosis("");
    router.refresh();
  };

  const submitCompletion = async (event: FormEvent) => {
    event.preventDefault();
    if (actionsLocked) {
      setCompletionError("Appointment is already completed.");
      return;
    }

    const consultationFeeResult = parseNonNegativeNumber(consultationFee, "Consultation fee");
    if (consultationFeeResult.error) {
      setCompletionError(consultationFeeResult.error);
      return;
    }

    const treatmentCostResult = parseNonNegativeNumber(treatmentCost, "Treatment cost");
    if (treatmentCostResult.error) {
      setCompletionError(treatmentCostResult.error);
      return;
    }

    const medicationCostResult = parseNonNegativeNumber(medicationCost, "Medication cost");
    if (medicationCostResult.error) {
      setCompletionError(medicationCostResult.error);
      return;
    }

    if (!visitNotes.trim() && !defaultVisitNotes.trim()) {
      setCompletionError("Visit summary is required before completion.");
      return;
    }

    setCompletionError(null);
    setCompletionMessage(null);
    setCompletionSaving(true);

    const { data, error } = await postVetAction<{ message?: string }>(`/vet/appointments/${appointmentId}/complete`, {
      vetId,
      notes: visitNotes.trim() || null,
      consultationFee: consultationFeeResult.value,
      treatmentCost: treatmentCostResult.value,
      medicationCost: medicationCostResult.value,
      dueDate: dueDate || null,
    });

    setCompletionSaving(false);
    if (error) {
      setCompletionError(error);
      return;
    }

    setCompletionMessage(data?.message ?? "Appointment completed and bill generated.");
    setIsCompletedLocal(true);
    router.refresh();
  };

  const submitReschedule = async (event: FormEvent) => {
    event.preventDefault();
    if (actionsLocked) {
      setRescheduleError("Appointment is already completed. Reschedule is locked.");
      return;
    }
    if (!appointmentDateTime.trim()) {
      setRescheduleError("New appointment date/time is required.");
      return;
    }

    setRescheduleError(null);
    setRescheduleMessage(null);
    setRescheduleSaving(true);

    const { data, error } = await postVetAction<{ message?: string }>(
      `/vet/appointments/${appointmentId}/reschedule`,
      {
        vetId,
        newDateTime: appointmentDateTime,
      }
    );

    setRescheduleSaving(false);
    if (error) {
      setRescheduleError(error);
      return;
    }

    setRescheduleMessage(data?.message ?? "Appointment rescheduled.");
    router.refresh();
  };

  return (
    <>
      <section className={styles.card}>
        <h2 className={styles.pageTitle}>Create Visit Record</h2>
        {actionsLocked ? <p className={styles.pageSubtitle}>Appointment completed. Actions are locked.</p> : null}
        <form onSubmit={submitVisitSummary} className={`${styles.formRow} ${styles.mt1}`}>
          <div className={styles.formGroup} style={{ minWidth: "100%" }}>
            <label className={styles.formLabel}>Diagnosis / Symptoms / Follow-up notes</label>
            <textarea
              className={styles.inputControl}
              rows={4}
              value={visitNotes}
              onChange={(event) => setVisitNotes(event.target.value)}
              placeholder="Visit summary notes"
              disabled={actionsLocked}
            />
          </div>
          <button type="submit" className={styles.btn} disabled={visitSaving || actionsLocked}>
            {visitSaving ? "Saving..." : "Save visit summary"}
          </button>
        </form>
        {visitMessage ? <p className={styles.tileSub}>{visitMessage}</p> : null}
        {visitError ? <p className={styles.errorText}>{visitError}</p> : null}
      </section>

      <section className={styles.card}>
        <h2 className={styles.pageTitle}>Reschedule Appointment</h2>
        <form onSubmit={submitReschedule} className={`${styles.formRow} ${styles.mt1}`}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>New date/time</label>
            <input
              type="datetime-local"
              className={styles.inputControl}
              value={appointmentDateTime}
              onChange={(event) => setAppointmentDateTime(event.target.value)}
              disabled={actionsLocked || rescheduleSaving}
            />
          </div>
          <button type="submit" className={styles.btn} disabled={actionsLocked || rescheduleSaving}>
            {rescheduleSaving ? "Saving..." : "Reschedule"}
          </button>
        </form>
        {rescheduleMessage ? <p className={styles.tileSub}>{rescheduleMessage}</p> : null}
        {rescheduleError ? <p className={styles.errorText}>{rescheduleError}</p> : null}
      </section>

      <section className={styles.card}>
        <h2 className={styles.pageTitle}>Prescription</h2>
        <form onSubmit={submitPrescription} className={`${styles.formRow} ${styles.mt1}`}>
          <div className={styles.formGroup} style={{ minWidth: "100%" }}>
            <label className={styles.formLabel}>Treatment</label>
            <textarea
              className={styles.inputControl}
              rows={3}
              value={treatment}
              onChange={(event) => setTreatment(event.target.value)}
              placeholder="Treatment plan"
              disabled={actionsLocked}
            />
          </div>
          <div className={styles.formGroup} style={{ minWidth: "100%" }}>
            <label className={styles.formLabel}>Medicines (branch stock)</label>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Select</th>
                    <th>Medicine</th>
                    <th>Quantity</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {availableSelectableMedicines.length === 0 ? (
                    <tr>
                      <td colSpan={4} className={styles.emptyCell}>
                        No available medicine in stock.
                      </td>
                    </tr>
                  ) : (
                    availableSelectableMedicines.map((medicine) => (
                      <tr key={medicine.medicineid}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedMedicineIds.includes(medicine.medicineid)}
                            onChange={() => toggleMedicine(medicine.medicineid)}
                            disabled={actionsLocked}
                          />
                        </td>
                        <td>{medicine.name}</td>
                        <td>{medicine.quantity ?? 0}</td>
                        <td>{medicine.status ?? "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <button type="submit" className={styles.btn} disabled={prescriptionSaving || actionsLocked || !selectedPetId}>
            {prescriptionSaving ? "Saving..." : "Save prescription"}
          </button>
        </form>
        {prescriptionMessage ? <p className={styles.tileSub}>{prescriptionMessage}</p> : null}
        {prescriptionError ? <p className={styles.errorText}>{prescriptionError}</p> : null}
      </section>

      <section className={styles.card}>
        <h2 className={styles.pageTitle}>Referral</h2>
        <form onSubmit={submitReferral} className={`${styles.formRow} ${styles.mt1}`}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Referee veterinarian</label>
            <select
              className={styles.inputControl}
              value={refereeVetId ?? ""}
              onChange={(event) => setRefereeVetId(Number.parseInt(event.target.value, 10))}
              disabled={actionsLocked}
            >
              {referralTargets.map((target) => (
                <option key={target.veterinarianid} value={target.veterinarianid}>
                  {target.veterinarian_name} · {target.branch_name}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.formGroup} style={{ minWidth: "100%" }}>
            <label className={styles.formLabel}>Referral diagnosis</label>
            <textarea
              className={styles.inputControl}
              rows={3}
              value={referralDiagnosis}
              onChange={(event) => setReferralDiagnosis(event.target.value)}
              placeholder="Diagnosis summary for referral"
              disabled={actionsLocked}
            />
          </div>
          <button
            type="submit"
            className={styles.btn}
            disabled={referralSaving || actionsLocked || referralTargets.length === 0 || !refereeVetId}
          >
            {referralSaving ? "Saving..." : "Create referral"}
          </button>
        </form>
        {referralMessage ? <p className={styles.tileSub}>{referralMessage}</p> : null}
        {referralError ? <p className={styles.errorText}>{referralError}</p> : null}
      </section>

      <section className={styles.card}>
        <h2 className={styles.pageTitle}>Complete Appointment</h2>
        <form onSubmit={submitCompletion} className={`${styles.formRow} ${styles.mt1}`}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Consultation fee</label>
            <input
              className={styles.inputControl}
              value={consultationFee}
              onChange={(event) => setConsultationFee(event.target.value)}
              disabled={actionsLocked}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Treatment cost</label>
            <input
              className={styles.inputControl}
              value={treatmentCost}
              onChange={(event) => setTreatmentCost(event.target.value)}
              disabled={actionsLocked}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Medication cost</label>
            <input
              className={styles.inputControl}
              value={medicationCost}
              onChange={(event) => setMedicationCost(event.target.value)}
              disabled={actionsLocked}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Due date (optional)</label>
            <input
              type="date"
              className={styles.inputControl}
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              disabled={actionsLocked}
            />
          </div>
          <button type="submit" className={styles.btn} disabled={completionSaving || actionsLocked}>
            {completionSaving ? "Completing..." : "Complete visit"}
          </button>
        </form>
        {completionMessage ? <p className={styles.tileSub}>{completionMessage}</p> : null}
        {completionError ? <p className={styles.errorText}>{completionError}</p> : null}
      </section>
    </>
  );
}
