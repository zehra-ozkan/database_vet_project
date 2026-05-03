"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "../dashboard/vet_dashboard_page.module.css";

type IncomingReferral = {
  referraldate: string;
  diagnosis: string | null;
  diagnosis_raw: string | null;
  approved: boolean;
  referrer_vet_id: number;
  referrer_name: string;
  inferred_owner_id: number | null;
  inferred_owner_name: string | null;
  inferred_vaccination_plan_id: number | null;
  inferred_appointment_type: string | null;
};

type IncomingReferralActionsProps = {
  vetId: number;
  referral: IncomingReferral;
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

async function approveReferral(
  payload: Record<string, unknown>
): Promise<{ error: string | null }> {
  let lastError = "Request failed.";

  for (const apiBase of clientApiBaseCandidates) {
    try {
      const response = await fetch(`${apiBase}/vet/referrals/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const responsePayload = (await response.json()) as { error?: unknown };
      if (!response.ok) {
        lastError = buildErrorMessage(responsePayload, response.status);
        continue;
      }
      return { error: null };
    } catch (error) {
      if (error instanceof Error) {
        lastError = error.message;
      }
    }
  }

  return { error: lastError };
}

function getDefaultDateTimeLocal(): string {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export default function IncomingReferralActions({
  vetId,
  referral,
}: IncomingReferralActionsProps) {
  const router = useRouter();
  const [isApproved, setIsApproved] = useState(referral.approved);
  const [open, setOpen] = useState(false);
  const [scheduledDateTime, setScheduledDateTime] = useState(getDefaultDateTimeLocal());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ownerSummary = useMemo(() => {
    if (!referral.inferred_owner_id) {
      return "Owner context could not be inferred.";
    }
    return `Owner: ${referral.inferred_owner_name ?? "Unknown"} (#${referral.inferred_owner_id})`;
  }, [referral.inferred_owner_id, referral.inferred_owner_name]);

  const submitApproval = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaving(true);

    const { error: submitError } = await approveReferral({
      vetId,
      referrerVetId: referral.referrer_vet_id,
      referralDate: referral.referraldate,
      diagnosisRaw: referral.diagnosis_raw,
      scheduledDateTime,
      petOwnerId: referral.inferred_owner_id,
      vaccinationPlanId: referral.inferred_vaccination_plan_id,
      appointmentType: referral.inferred_appointment_type ?? "COMPLAINT",
    });

    setSaving(false);
    if (submitError) {
      setError(submitError);
      return;
    }

    setIsApproved(true);
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      {isApproved ? (
        <span className={`${styles.pill} ${styles.pillOk}`}>Approved</span>
      ) : (
        <button type="button" className={styles.btn} onClick={() => setOpen(true)}>
          Approve
        </button>
      )}
      {open ? (
        <div className={styles.modalBackdrop} onClick={() => (!saving ? setOpen(false) : null)}>
          <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <h3 className={styles.pageTitle}>Approve referral</h3>
            <p className={styles.pageSubtitle}>{ownerSummary}</p>
            <form onSubmit={submitApproval} className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Appointment date/time</label>
                <input
                  type="datetime-local"
                  className={styles.inputControl}
                  value={scheduledDateTime}
                  onChange={(event) => setScheduledDateTime(event.target.value)}
                  disabled={saving}
                />
              </div>
              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.ghost}`}
                  onClick={() => setOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.btn} disabled={saving || !scheduledDateTime}>
                  {saving ? "Saving..." : "Confirm"}
                </button>
              </div>
            </form>
            {error ? <p className={styles.errorText}>{error}</p> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
