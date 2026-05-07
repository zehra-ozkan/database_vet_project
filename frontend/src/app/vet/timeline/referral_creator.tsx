"use client";

import { FormEvent, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import styles from "../dashboard/vet_dashboard_page.module.css";
import { vetBuildApiErrorMessage, vetBuildClientErrorMessage } from "../vet_error_messages";

type ReferralTarget = {
  veterinarianid: number;
  veterinarian_name: string;
  branch_name: string;
};

type ReferralPetContext = {
  petId: number;
  petName: string;
  petOwnerId: number;
  petOwnerName: string;
  vaccinationPlanId?: number | null;
};

type ReferralAppointmentType = "CHECKUP" | "VACCINATION" | "COMPLAINT" | "EMERGENCY";

type ReferralCreatorProps = {
  vetId: number;
  referralTargets: ReferralTarget[];
  autoOpen?: boolean;
  petContext?: ReferralPetContext | null;
  petOptions?: ReferralPetContext[];
};

const referralAppointmentTypeOptions: Array<{
  value: ReferralAppointmentType;
  label: string;
}> = [
  { value: "COMPLAINT", label: "Complaint" },
  { value: "CHECKUP", label: "Checkup" },
  { value: "VACCINATION", label: "Vaccination" },
  { value: "EMERGENCY", label: "Emergency" },
];

const clientApiBaseCandidates = Array.from(
  new Set(
    [process.env.NEXT_PUBLIC_API_URL, "http://localhost:5000/api"]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.replace(/\/$/, ""))
  )
);

async function postReferralAction(
  payload: Record<string, unknown>
): Promise<{ error: string | null }> {
  let lastError = "Request failed.";

  for (const apiBase of clientApiBaseCandidates) {
    try {
      const response = await fetch(`${apiBase}/vet/referrals`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const responsePayload = (await response.json()) as { error?: string };
      if (!response.ok) {
        lastError = vetBuildApiErrorMessage(responsePayload, response.status, "Request failed.");
        continue;
      }
      return { error: null };
    } catch (error) {
      lastError = vetBuildClientErrorMessage(error, "Request failed.");
    }
  }

  return { error: lastError };
}

export default function ReferralCreator({
  vetId,
  referralTargets,
  autoOpen = false,
  petContext = null,
  petOptions = [],
}: ReferralCreatorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [refereeVetId, setRefereeVetId] = useState<number | null>(
    referralTargets.length > 0 ? referralTargets[0].veterinarianid : null
  );
  const [selectedPetId, setSelectedPetId] = useState<number | null>(petContext?.petId ?? null);
  const [appointmentType, setAppointmentType] = useState<ReferralAppointmentType>("COMPLAINT");
  const [diagnosis, setDiagnosis] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    autoOpen && referralTargets.length === 0
      ? "No referral target veterinarian is available."
      : null
  );
  const isModalOpen = (autoOpen && referralTargets.length > 0) || manualModalOpen;
  const availablePetOptions: ReferralPetContext[] = [];
  const seenPetIds = new Set<number>();
  const addPetOption = (option: ReferralPetContext | null | undefined) => {
    if (!option || seenPetIds.has(option.petId)) {
      return;
    }
    seenPetIds.add(option.petId);
    availablePetOptions.push(option);
  };
  addPetOption(petContext);
  for (const option of petOptions) {
    addPetOption(option);
  }
  const activePetContext =
    availablePetOptions.find((option) => option.petId === selectedPetId) ??
    availablePetOptions[0] ??
    null;

  const clearAutoOpenQuery = () => {
    if (!autoOpen) {
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete("openReferral");
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}#create-referral`, { scroll: false });
  };

  const submitReferral = async (event: FormEvent) => {
    event.preventDefault();
    if (!activePetContext) {
      setError("Select a pet first to create referral.");
      return;
    }
    setError(null);
    setMessage(null);
    setSaving(true);

    const payload: Record<string, unknown> = {
      vetId,
      refereeVetId,
      diagnosis,
      appointmentType,
    };
    if (activePetContext) {
      payload.petId = activePetContext.petId;
      payload.petOwnerId = activePetContext.petOwnerId;
      if (activePetContext.vaccinationPlanId) {
        payload.vaccinationPlanId = activePetContext.vaccinationPlanId;
      }
    }

    const { error: submitError } = await postReferralAction(payload);

    setSaving(false);
    if (submitError) {
      setError(submitError);
      return;
    }

    setDiagnosis("");
    setMessage("Referral created successfully.");
    setManualModalOpen(false);
    clearAutoOpenQuery();
  };

  const openModal = () => {
    setError(null);
    setMessage(null);
    if (!selectedPetId && availablePetOptions.length > 0) {
      setSelectedPetId(availablePetOptions[0].petId);
    }
    setManualModalOpen(true);
  };

  const closeModal = () => {
    if (saving) {
      return;
    }
    setManualModalOpen(false);
    clearAutoOpenQuery();
  };

  return (
    <>
      <button
        type="button"
        className={styles.btn}
        onClick={openModal}
        disabled={referralTargets.length === 0 || availablePetOptions.length === 0}
      >
        Create referral
      </button>
      {referralTargets.length === 0 ? (
        <p className={styles.errorText}>No referral target veterinarian is available.</p>
      ) : null}
      {availablePetOptions.length === 0 ? (
        <p className={styles.errorText}>Select a pet from timeline first.</p>
      ) : null}
      {message ? <p className={styles.tileSub}>{message}</p> : null}
      {error ? <p className={styles.errorText}>{error}</p> : null}
      {isModalOpen ? (
        <div className={styles.modalBackdrop} onClick={closeModal}>
          <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <h3 className={styles.pageTitle}>Create referral</h3>
            <p className={styles.pageSubtitle}>
              {activePetContext
                ? `Pet: ${activePetContext.petName} (#${activePetContext.petId}) · Owner: ${activePetContext.petOwnerName} (#${activePetContext.petOwnerId})`
                : "No pet selected. Select a pet from timeline filter first."}
            </p>
            <form onSubmit={submitReferral} className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Pet</label>
                <select
                  className={styles.inputControl}
                  value={activePetContext?.petId ?? ""}
                  onChange={(event) => {
                    const parsedValue = Number.parseInt(event.target.value, 10);
                    setSelectedPetId(Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null);
                  }}
                  disabled={saving || availablePetOptions.length === 0}
                >
                  {availablePetOptions.length === 0 ? (
                    <option value="">No pet available</option>
                  ) : (
                    availablePetOptions.map((option) => (
                      <option key={option.petId} value={option.petId}>
                        {option.petName} · {option.petOwnerName}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Referee veterinarian</label>
                <select
                  className={styles.inputControl}
                  value={refereeVetId ?? ""}
                  onChange={(event) => setRefereeVetId(Number.parseInt(event.target.value, 10))}
                >
                  {referralTargets.map((target) => (
                    <option key={target.veterinarianid} value={target.veterinarianid}>
                      {target.veterinarian_name} · {target.branch_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Appointment type</label>
                <select
                  className={styles.inputControl}
                  value={appointmentType}
                  onChange={(event) => {
                    const nextType = event.target.value as ReferralAppointmentType;
                    setAppointmentType(nextType);
                  }}
                  disabled={saving}
                >
                  {referralAppointmentTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.formGroup} style={{ minWidth: "100%" }}>
                <label className={styles.formLabel}>Referral diagnosis</label>
                <textarea
                  className={styles.inputControl}
                  rows={3}
                  value={diagnosis}
                  onChange={(event) => setDiagnosis(event.target.value)}
                  placeholder="Diagnosis summary for referral"
                />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className={`${styles.btn} ${styles.ghost}`} onClick={closeModal}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.btn}
                  disabled={saving || !refereeVetId || !activePetContext}
                >
                  {saving ? "Saving..." : "Submit referral"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
