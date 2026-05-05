"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "../../dashboard/vet_dashboard_page.module.css";

type MedicineOption = {
  medicineid: number;
  name: string;
  quantity: number | null;
  status: string | null;
  category?: string | null;
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

type AppointmentDraft = {
  selectedPetId: number | null;
  visitNotes: string;
  treatment: string;
  selectedMedicineIds: number[];
  refereeVetId: number | null;
  referralDiagnosis: string;
  vaccinationVaccineId: number | null;
  vaccinationShotDate: string;
  vaccinationNextDueDate: string;
  vaccinationFrequencyDays: string;
  vaccinationDoseCount: string;
  consultationFee: string;
  treatmentCost: string;
  medicationCost: string;
  dueDate: string;
  appointmentDateTime: string;
};

type FinalizeResponse = {
  message?: string;
  follow_up_appointment?: unknown | null;
  prescription?: unknown | null;
  vaccination_record?: unknown | null;
  referral?: unknown | null;
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
  const [vaccinationVaccineId, setVaccinationVaccineId] = useState<number | null>(null);
  const [vaccinationShotDate, setVaccinationShotDate] = useState("");
  const [vaccinationNextDueDate, setVaccinationNextDueDate] = useState("");
  const [vaccinationFrequencyDays, setVaccinationFrequencyDays] = useState("");
  const [vaccinationDoseCount, setVaccinationDoseCount] = useState("");
  const [vaccinationMessage, setVaccinationMessage] = useState<string | null>(null);
  const [vaccinationError, setVaccinationError] = useState<string | null>(null);
  const [vaccinationSaving, setVaccinationSaving] = useState(false);

  const [refereeVetId, setRefereeVetId] = useState<number | null>(null);
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
  const availableVaccines = useMemo(
    () =>
      medicines.filter(
        (medicine) =>
          String(medicine.category ?? "").toLowerCase() === "vaccine" && (medicine.quantity ?? 0) > 0
      ),
    [medicines]
  );
  const actionsLocked = isCompletedLocal;
  const draftStorageKey = useMemo(
    () => `vet_appointment_draft:${vetId}:${appointmentId}`,
    [vetId, appointmentId]
  );

  const persistDraft = (overrides: Partial<AppointmentDraft> = {}) => {
    if (typeof window === "undefined") {
      return;
    }
    const snapshot: AppointmentDraft = {
      selectedPetId,
      visitNotes,
      treatment,
      selectedMedicineIds,
      vaccinationVaccineId,
      vaccinationShotDate,
      vaccinationNextDueDate,
      vaccinationFrequencyDays,
      vaccinationDoseCount,
      refereeVetId,
      referralDiagnosis,
      consultationFee,
      treatmentCost,
      medicationCost,
      dueDate,
      appointmentDateTime,
      ...overrides,
    };
    localStorage.setItem(draftStorageKey, JSON.stringify(snapshot));
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const rawDraft = localStorage.getItem(draftStorageKey);
    if (!rawDraft) {
      return;
    }

    try {
      const parsedDraft = JSON.parse(rawDraft) as Partial<AppointmentDraft>;

      if (
        parsedDraft.selectedPetId !== undefined &&
        parsedDraft.selectedPetId !== null &&
        parsedDraft.selectedPetId !== selectedPetId
      ) {
        return;
      }

      if (typeof parsedDraft.visitNotes === "string") {
        setVisitNotes(parsedDraft.visitNotes);
      }
      if (typeof parsedDraft.treatment === "string") {
        setTreatment(parsedDraft.treatment);
      }
      if (Array.isArray(parsedDraft.selectedMedicineIds)) {
        const normalizedIds = parsedDraft.selectedMedicineIds
          .map((value) => Number.parseInt(String(value), 10))
          .filter((value) => Number.isInteger(value) && value > 0);
        setSelectedMedicineIds(Array.from(new Set(normalizedIds)));
      }
      if (typeof parsedDraft.vaccinationVaccineId === "number" && parsedDraft.vaccinationVaccineId > 0) {
        setVaccinationVaccineId(parsedDraft.vaccinationVaccineId);
      }
      if (typeof parsedDraft.vaccinationShotDate === "string") {
        setVaccinationShotDate(parsedDraft.vaccinationShotDate);
      }
      if (typeof parsedDraft.vaccinationNextDueDate === "string") {
        setVaccinationNextDueDate(parsedDraft.vaccinationNextDueDate);
      }
      if (typeof parsedDraft.vaccinationFrequencyDays === "string") {
        setVaccinationFrequencyDays(parsedDraft.vaccinationFrequencyDays);
      } else if (typeof (parsedDraft as { vaccinationFrequency?: string }).vaccinationFrequency === "string") {
        const legacyFrequency = ((parsedDraft as { vaccinationFrequency?: string }).vaccinationFrequency ?? "").trim();
        const legacyNumeric = Number.parseInt(legacyFrequency, 10);
        if (Number.isInteger(legacyNumeric) && legacyNumeric > 0) {
          setVaccinationFrequencyDays(String(legacyNumeric));
        }
      }
      if (typeof parsedDraft.vaccinationDoseCount === "string") {
        setVaccinationDoseCount(parsedDraft.vaccinationDoseCount);
      }
      if (typeof parsedDraft.referralDiagnosis === "string") {
        setReferralDiagnosis(parsedDraft.referralDiagnosis);
      }
      if (typeof parsedDraft.consultationFee === "string") {
        setConsultationFee(parsedDraft.consultationFee);
      }
      if (typeof parsedDraft.treatmentCost === "string") {
        setTreatmentCost(parsedDraft.treatmentCost);
      }
      if (typeof parsedDraft.medicationCost === "string") {
        setMedicationCost(parsedDraft.medicationCost);
      }
      if (typeof parsedDraft.dueDate === "string") {
        setDueDate(parsedDraft.dueDate);
      }
      if (typeof parsedDraft.appointmentDateTime === "string") {
        setAppointmentDateTime(parsedDraft.appointmentDateTime);
      }

      const targetVetIds = new Set(referralTargets.map((target) => target.veterinarianid));
      if (
        typeof parsedDraft.refereeVetId === "number" &&
        targetVetIds.has(parsedDraft.refereeVetId)
      ) {
        setRefereeVetId(parsedDraft.refereeVetId);
      }
    } catch {
      // Ignore malformed client drafts.
    }
  }, [draftStorageKey, selectedPetId, referralTargets]);

  const parseNonNegativeNumber = (value: string, label: string): { value: number | null; error: string | null } => {
    const normalizedValue = value.trim();
    if (normalizedValue === "") {
      return { value: 0, error: null };
    }
    const parsed = Number.parseFloat(normalizedValue.replace(",", "."));
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

    const normalizedNotes = visitNotes.trim();
    if (!normalizedNotes) {
      setVisitError("Visit summary notes are required.");
      return;
    }

    setVisitError(null);
    setVisitMessage(null);
    setVisitSaving(true);
    setVisitNotes(normalizedNotes);
    persistDraft({ visitNotes: normalizedNotes });
    setVisitSaving(false);
    setVisitMessage("Visit summary draft saved. It will be committed on Complete visit.");
  };

  const submitPrescription = async (event: FormEvent) => {
    event.preventDefault();
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
    setTreatment(normalizedTreatment);
    persistDraft({
      selectedPetId,
      treatment: normalizedTreatment,
      selectedMedicineIds,
    });
    setPrescriptionSaving(false);
    setPrescriptionMessage("Prescription draft saved. It will be committed on Complete visit.");
  };

  const submitReferral = async (event: FormEvent) => {
    event.preventDefault();
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
    setReferralDiagnosis(normalizedDiagnosis);
    persistDraft({
      selectedPetId,
      refereeVetId,
      referralDiagnosis: normalizedDiagnosis,
    });
    setReferralSaving(false);
    setReferralMessage("Referral draft saved. It will be committed on Complete visit.");
  };

  const parseOptionalPositiveInteger = (
    value: string,
    label: string
  ): { value: number | null; error: string | null } => {
    const normalized = value.trim();
    if (!normalized) {
      return { value: null, error: null };
    }
    const parsed = Number.parseInt(normalized, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return { value: null, error: `${label} must be a positive integer.` };
    }
    return { value: parsed, error: null };
  };

  const deriveNextDueDate = (shotDateValue: string, frequencyDays: number): string | null => {
    if (!Number.isInteger(frequencyDays) || frequencyDays <= 0) {
      return null;
    }

    const baseDate = shotDateValue
      ? new Date(`${shotDateValue}T00:00:00`)
      : new Date();
    if (Number.isNaN(baseDate.getTime())) {
      return null;
    }
    baseDate.setDate(baseDate.getDate() + frequencyDays);

    const year = baseDate.getFullYear();
    const month = String(baseDate.getMonth() + 1).padStart(2, "0");
    const day = String(baseDate.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const submitVaccination = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedPetId) {
      setVaccinationError("Select a pet before adding vaccination data.");
      return;
    }
    if (!vaccinationVaccineId) {
      setVaccinationError("Select a vaccine.");
      return;
    }

    const frequencyDaysResult = parseOptionalPositiveInteger(
      vaccinationFrequencyDays,
      "Frequency days"
    );
    if (frequencyDaysResult.error) {
      setVaccinationError(frequencyDaysResult.error);
      return;
    }

    const doseCountResult = parseOptionalPositiveInteger(
      vaccinationDoseCount,
      "Total doses"
    );
    if (doseCountResult.error) {
      setVaccinationError(doseCountResult.error);
      return;
    }

    let normalizedNextDueDate = vaccinationNextDueDate.trim();
    if (!normalizedNextDueDate && frequencyDaysResult.value) {
      normalizedNextDueDate =
        deriveNextDueDate(vaccinationShotDate, frequencyDaysResult.value) ?? "";
    }
    if (
      !normalizedNextDueDate &&
      frequencyDaysResult.value === null &&
      doseCountResult.value === null
    ) {
      setVaccinationError(
        "Provide next due date, frequency days, or total doses."
      );
      return;
    }

    setVaccinationError(null);
    setVaccinationMessage(null);
    setVaccinationSaving(true);
    if (normalizedNextDueDate && normalizedNextDueDate !== vaccinationNextDueDate) {
      setVaccinationNextDueDate(normalizedNextDueDate);
    }
    persistDraft({
      selectedPetId,
      vaccinationVaccineId,
      vaccinationShotDate,
      vaccinationNextDueDate: normalizedNextDueDate,
      vaccinationFrequencyDays,
      vaccinationDoseCount,
    });
    setVaccinationSaving(false);
    setVaccinationMessage("Vaccination draft saved. It will be committed on Complete visit.");
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

    const normalizedTreatment = treatment.trim();
    const normalizedReferralDiagnosis = referralDiagnosis.trim();
    if (normalizedTreatment && !selectedPetId) {
      setCompletionError("Select a pet before completing with prescription.");
      return;
    }
    if (selectedMedicineIds.length > 0 && !normalizedTreatment) {
      setCompletionError("Treatment is required when medicines are selected.");
      return;
    }
    if (normalizedReferralDiagnosis && !refereeVetId) {
      setCompletionError("Select a referee veterinarian for referral.");
      return;
    }
    if (vaccinationVaccineId && !selectedPetId) {
      setCompletionError("Select a pet before completing with vaccination.");
      return;
    }
    const frequencyDaysResult = parseOptionalPositiveInteger(
      vaccinationFrequencyDays,
      "Frequency days"
    );
    if (frequencyDaysResult.error) {
      setCompletionError(frequencyDaysResult.error);
      return;
    }

    const doseCountResult = parseOptionalPositiveInteger(
      vaccinationDoseCount,
      "Total doses"
    );
    if (doseCountResult.error) {
      setCompletionError(doseCountResult.error);
      return;
    }

    let normalizedVaccinationNextDueDate = vaccinationNextDueDate.trim();
    if (!normalizedVaccinationNextDueDate && frequencyDaysResult.value) {
      normalizedVaccinationNextDueDate =
        deriveNextDueDate(vaccinationShotDate, frequencyDaysResult.value) ?? "";
    }
    if (
      vaccinationVaccineId &&
      !normalizedVaccinationNextDueDate &&
      frequencyDaysResult.value === null &&
      doseCountResult.value === null
    ) {
      setCompletionError(
        "Vaccination requires next due date, frequency days, or total doses."
      );
      return;
    }

    setCompletionError(null);
    setCompletionMessage(null);
    setCompletionSaving(true);

    const normalizedNotes =
      visitNotes.trim() ||
      defaultVisitNotes.trim() ||
      `Visit completed on ${new Date().toLocaleDateString("tr-TR")}.`;
    const normalizedDateTime = appointmentDateTime.trim();
    const requestedFollowUpDateTime =
      normalizedDateTime && normalizedDateTime !== defaultAppointmentDateTime
        ? normalizedDateTime
        : null;
    persistDraft({
      selectedPetId,
      visitNotes: normalizedNotes,
      treatment: normalizedTreatment,
      selectedMedicineIds,
      vaccinationVaccineId,
      vaccinationShotDate,
      vaccinationNextDueDate: normalizedVaccinationNextDueDate,
      vaccinationFrequencyDays,
      vaccinationDoseCount,
      refereeVetId,
      referralDiagnosis: normalizedReferralDiagnosis,
      consultationFee,
      treatmentCost,
      medicationCost,
      dueDate,
      appointmentDateTime: normalizedDateTime,
    });

    const { data, error } = await postVetAction<FinalizeResponse>(`/vet/appointments/${appointmentId}/finalize`, {
      vetId,
      notes: normalizedNotes,
      newDateTime: requestedFollowUpDateTime,
      petId: selectedPetId,
      treatment: normalizedTreatment || null,
      medicineIds: selectedMedicineIds,
      vaccinationVaccineId: vaccinationVaccineId ?? null,
      vaccinationShotDate: vaccinationShotDate || null,
      vaccinationNextDueDate: normalizedVaccinationNextDueDate || null,
      vaccinationFrequencyDays: frequencyDaysResult.value,
      vaccinationDoseCount: doseCountResult.value,
      refereeVetId: normalizedReferralDiagnosis ? refereeVetId ?? null : null,
      referralDiagnosis: normalizedReferralDiagnosis || null,
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

    const completionDetails: string[] = [];
    if (data?.prescription) {
      completionDetails.push("prescription");
    }
    if (data?.vaccination_record) {
      completionDetails.push("vaccination");
    }
    if (data?.referral) {
      completionDetails.push("referral");
    }
    if (data?.follow_up_appointment) {
      completionDetails.push("follow-up appointment");
    }
    const detailSuffix =
      completionDetails.length > 0 ? ` Created: ${completionDetails.join(", ")}.` : "";
    setCompletionMessage((data?.message ?? "Appointment finalized successfully.") + detailSuffix);
    setIsCompletedLocal(true);
    if (typeof window !== "undefined") {
      localStorage.removeItem(draftStorageKey);
    }
    router.refresh();
  };

  const submitReschedule = async (event: FormEvent) => {
    event.preventDefault();
    if (!appointmentDateTime.trim()) {
      setRescheduleError("New appointment date/time is required.");
      return;
    }

    setRescheduleError(null);
    setRescheduleMessage(null);
    setRescheduleSaving(true);
    persistDraft({
      selectedPetId,
      appointmentDateTime: appointmentDateTime.trim(),
    });
    setRescheduleSaving(false);
    setRescheduleMessage("Reschedule draft saved. It will be committed on Complete visit.");
  };

  return (
    <>
      <section className={styles.card}>
        <h2 className={styles.pageTitle}>Create Visit Record</h2>
        {actionsLocked ? (
          <p className={styles.pageSubtitle}>
            Appointment is completed. You can still edit drafts, but completion is locked.
          </p>
        ) : null}
        <form onSubmit={submitVisitSummary} className={`${styles.formRow} ${styles.mt1}`}>
          <div className={styles.formGroup} style={{ minWidth: "100%" }}>
            <label className={styles.formLabel}>Diagnosis / Symptoms / Follow-up notes</label>
            <textarea
              className={styles.inputControl}
              rows={4}
              value={visitNotes}
              onChange={(event) => setVisitNotes(event.target.value)}
              placeholder="Visit summary notes"
              disabled={visitSaving}
            />
          </div>
          <button type="submit" className={styles.btn} disabled={visitSaving}>
            {visitSaving ? "Saving..." : "Save visit summary draft"}
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
              disabled={rescheduleSaving}
            />
          </div>
          <button type="submit" className={styles.btn} disabled={rescheduleSaving}>
            {rescheduleSaving ? "Saving..." : "Save reschedule draft"}
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
              disabled={prescriptionSaving}
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
                            disabled={prescriptionSaving}
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
          <button type="submit" className={styles.btn} disabled={prescriptionSaving || !selectedPetId}>
            {prescriptionSaving ? "Saving..." : "Save prescription draft"}
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
              onChange={(event) => {
                const rawValue = event.target.value;
                if (!rawValue) {
                  setRefereeVetId(null);
                  return;
                }
                const parsedValue = Number.parseInt(rawValue, 10);
                setRefereeVetId(Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null);
              }}
              disabled={referralSaving}
            >
              <option value="">No referral target selected</option>
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
              disabled={referralSaving}
            />
          </div>
          <button
            type="submit"
            className={styles.btn}
            disabled={referralSaving || referralTargets.length === 0 || !refereeVetId}
          >
            {referralSaving ? "Saving..." : "Save referral draft"}
          </button>
        </form>
        {referralMessage ? <p className={styles.tileSub}>{referralMessage}</p> : null}
        {referralError ? <p className={styles.errorText}>{referralError}</p> : null}
      </section>

      <section className={styles.card}>
        <h2 className={styles.pageTitle}>Vaccination</h2>
        <form onSubmit={submitVaccination} className={`${styles.formRow} ${styles.mt1}`}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Vaccine</label>
            <select
              className={styles.inputControl}
              value={vaccinationVaccineId ?? ""}
              onChange={(event) => {
                const rawValue = event.target.value;
                if (!rawValue) {
                  setVaccinationVaccineId(null);
                  return;
                }
                const parsedValue = Number.parseInt(rawValue, 10);
                setVaccinationVaccineId(Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null);
              }}
              disabled={vaccinationSaving}
            >
              <option value="">No vaccine selected</option>
              {availableVaccines.map((vaccine) => (
                <option key={vaccine.medicineid} value={vaccine.medicineid}>
                  {vaccine.name}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Shot date (optional)</label>
            <input
              type="date"
              className={styles.inputControl}
              value={vaccinationShotDate}
              onChange={(event) => setVaccinationShotDate(event.target.value)}
              disabled={vaccinationSaving}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Next due date</label>
            <input
              type="date"
              className={styles.inputControl}
              value={vaccinationNextDueDate}
              onChange={(event) => setVaccinationNextDueDate(event.target.value)}
              disabled={vaccinationSaving}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Frequency (days)</label>
            <input
              type="number"
              min={1}
              className={styles.inputControl}
              value={vaccinationFrequencyDays}
              onChange={(event) => setVaccinationFrequencyDays(event.target.value)}
              placeholder="e.g. 30"
              disabled={vaccinationSaving}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Total doses (optional)</label>
            <input
              type="number"
              min={1}
              className={styles.inputControl}
              value={vaccinationDoseCount}
              onChange={(event) => setVaccinationDoseCount(event.target.value)}
              placeholder="e.g. 3"
              disabled={vaccinationSaving}
            />
          </div>
          <button type="submit" className={styles.btn} disabled={vaccinationSaving || availableVaccines.length === 0}>
            {vaccinationSaving ? "Saving..." : "Save vaccination draft"}
          </button>
        </form>
        {vaccinationMessage ? <p className={styles.tileSub}>{vaccinationMessage}</p> : null}
        {vaccinationError ? <p className={styles.errorText}>{vaccinationError}</p> : null}
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
              disabled={completionSaving}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Treatment cost</label>
            <input
              className={styles.inputControl}
              value={treatmentCost}
              onChange={(event) => setTreatmentCost(event.target.value)}
              disabled={completionSaving}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Medication cost</label>
            <input
              className={styles.inputControl}
              value={medicationCost}
              onChange={(event) => setMedicationCost(event.target.value)}
              disabled={completionSaving}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Due date (optional)</label>
            <input
              type="date"
              className={styles.inputControl}
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              disabled={completionSaving}
            />
          </div>
          <button type="submit" className={styles.btn} disabled={completionSaving}>
            {completionSaving ? "Completing..." : "Complete visit"}
          </button>
        </form>
        {completionMessage ? <p className={styles.tileSub}>{completionMessage}</p> : null}
        {completionError ? <p className={styles.errorText}>{completionError}</p> : null}
      </section>
    </>
  );
}
