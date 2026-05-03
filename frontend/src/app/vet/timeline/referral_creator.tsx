"use client";

import { FormEvent, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import styles from "../dashboard/vet_dashboard_page.module.css";

type ReferralTarget = {
  veterinarianid: number;
  veterinarian_name: string;
  branch_name: string;
};

type ReferralCreatorProps = {
  vetId: number;
  referralTargets: ReferralTarget[];
  autoOpen?: boolean;
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

export default function ReferralCreator({
  vetId,
  referralTargets,
  autoOpen = false,
}: ReferralCreatorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [refereeVetId, setRefereeVetId] = useState<number | null>(
    referralTargets.length > 0 ? referralTargets[0].veterinarianid : null
  );
  const [diagnosis, setDiagnosis] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    autoOpen && referralTargets.length === 0
      ? "No referral target veterinarian is available."
      : null
  );
  const isModalOpen = (autoOpen && referralTargets.length > 0) || manualModalOpen;

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
    setError(null);
    setMessage(null);
    setSaving(true);

    const { error: submitError } = await postReferralAction({
      vetId,
      refereeVetId,
      diagnosis,
    });

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
        disabled={referralTargets.length === 0}
      >
        Create referral
      </button>
      {referralTargets.length === 0 ? (
        <p className={styles.errorText}>No referral target veterinarian is available.</p>
      ) : null}
      {message ? <p className={styles.tileSub}>{message}</p> : null}
      {error ? <p className={styles.errorText}>{error}</p> : null}
      {isModalOpen ? (
        <div className={styles.modalBackdrop} onClick={closeModal}>
          <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <h3 className={styles.pageTitle}>Create referral</h3>
            <form onSubmit={submitReferral} className={styles.formRow}>
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
                  disabled={saving || !refereeVetId}
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
