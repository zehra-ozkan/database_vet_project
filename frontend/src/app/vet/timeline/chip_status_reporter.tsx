"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import styles from "../dashboard/vet_dashboard_page.module.css";

type ChipStatusReporterProps = {
  vetId: number;
  petId: number;
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

async function postChipStatusReport(
  petId: number,
  payload: Record<string, unknown>
): Promise<{ error: string | null }> {
  let lastError = "Request failed.";

  for (const apiBase of clientApiBaseCandidates) {
    try {
      const response = await fetch(`${apiBase}/vet/pets/${petId}/lost-found-report`, {
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

export default function ChipStatusReporter({ vetId, petId }: ChipStatusReporterProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submitStatus = async (isFound: boolean) => {
    setSaving(true);
    setMessage(null);
    setError(null);

    const { error: submitError } = await postChipStatusReport(petId, {
      vetId,
      isFound,
    });
    setSaving(false);

    if (submitError) {
      setError(submitError);
      return;
    }

    setMessage(isFound ? "Marked as found." : "Reported as lost.");
    router.refresh();
  };

  return (
    <div className={`${styles.formRow} ${styles.mt1}`}>
      <button
        type="button"
        className={`${styles.btn} ${styles.ghost}`}
        onClick={() => submitStatus(false)}
        disabled={saving}
      >
        {saving ? "Saving..." : "Report lost"}
      </button>
      <button
        type="button"
        className={styles.btn}
        onClick={() => submitStatus(true)}
        disabled={saving}
      >
        {saving ? "Saving..." : "Mark found"}
      </button>
      {message ? <p className={styles.tileSub}>{message}</p> : null}
      {error ? <p className={styles.errorText}>{error}</p> : null}
    </div>
  );
}
