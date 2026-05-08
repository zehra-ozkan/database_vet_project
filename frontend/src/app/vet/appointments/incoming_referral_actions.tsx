"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { TIME_SLOTS } from "@/lib/constants";
import styles from "../dashboard/vet_dashboard_page.module.css";
import { vetBuildApiErrorMessage, vetBuildClientErrorMessage } from "../vet_error_messages";

type IncomingReferral = {
  referraldate: string;
  diagnosis: string | null;
  diagnosis_raw: string | null;
  approved: boolean;
  referrer_vet_id: number;
  referrer_name: string;
  inferred_owner_id: number | null;
  inferred_owner_name: string | null;
  inferred_pet_id: number | null;
  inferred_vaccination_plan_id: number | null;
  inferred_appointment_type: string | null;
};

type IncomingReferralActionsProps = {
  vetId: number;
  referral: IncomingReferral;
};

type OccupiedSlot = {
  datetime: string;
};

const clientApiBaseCandidates = Array.from(
  new Set(
    [process.env.NEXT_PUBLIC_API_URL, "http://localhost:5000/api"]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.replace(/\/$/, ""))
  )
);

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

function toLocalDateInputValue(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isPastSlot(dateValue: string, slot: string): boolean {
  if (!dateValue || !slot) {
    return false;
  }
  return new Date(`${dateValue}T${slot}:00`) < new Date();
}

function extractSlot(datetimeValue: string): string {
  const match = datetimeValue.match(/[T\s](\d{2}:\d{2})/);
  return match ? match[1] : "";
}

function getDefaultSchedule(): { date: string; slot: string } {
  const now = new Date();
  const today = toLocalDateInputValue(now);
  const currentHourMinute = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const nextTodaySlot = TIME_SLOTS.find((slot) => slot >= currentHourMinute);
  if (nextTodaySlot) {
    return { date: today, slot: nextTodaySlot };
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return { date: toLocalDateInputValue(tomorrow), slot: TIME_SLOTS[0] ?? "" };
}

async function fetchOccupiedSlots(
  vetId: number,
  selectedDate: string
): Promise<{ slots: string[]; error: string | null }> {
  let lastError = "Could not load occupied slots.";

  for (const apiBase of clientApiBaseCandidates) {
    try {
      const response = await fetch(
        `${apiBase}/owner/appointments/occupied?vetId=${encodeURIComponent(String(vetId))}&date=${encodeURIComponent(selectedDate)}`,
        { cache: "no-store" }
      );
      const responsePayload = (await response.json()) as OccupiedSlot[] & { error?: unknown };
      if (!response.ok) {
        lastError = vetBuildApiErrorMessage(responsePayload, response.status, "Could not load occupied slots.");
        continue;
      }

      const slots = responsePayload
        .map((row) => extractSlot(row.datetime))
        .filter((slot) => TIME_SLOTS.includes(slot));
      return { slots: Array.from(new Set(slots)), error: null };
    } catch (error) {
      lastError = vetBuildClientErrorMessage(error, "Could not load occupied slots.");
    }
  }

  return { slots: [], error: lastError };
}

export default function IncomingReferralActions({
  vetId,
  referral,
}: IncomingReferralActionsProps) {
  const router = useRouter();
  const defaultSchedule = useMemo(() => getDefaultSchedule(), []);
  const [isApproved, setIsApproved] = useState(referral.approved);
  const [open, setOpen] = useState(false);
  const [scheduledDate, setScheduledDate] = useState(defaultSchedule.date);
  const [scheduledSlot, setScheduledSlot] = useState(defaultSchedule.slot);
  const [occupiedSlots, setOccupiedSlots] = useState<string[]>([]);
  const [slotLoading, setSlotLoading] = useState(true);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const minSelectableDate = useMemo(() => toLocalDateInputValue(new Date()), []);
  const occupiedSlotSet = useMemo(() => new Set(occupiedSlots), [occupiedSlots]);

  const ownerSummary = useMemo(() => {
    if (!referral.inferred_owner_id) {
      return "Owner context could not be inferred.";
    }
    return `Owner: ${referral.inferred_owner_name ?? "Unknown"} (#${referral.inferred_owner_id})`;
  }, [referral.inferred_owner_id, referral.inferred_owner_name]);

  useEffect(() => {
    if (!open || !scheduledDate) {
      return;
    }

    let cancelled = false;

    fetchOccupiedSlots(vetId, scheduledDate)
      .then(({ slots, error: fetchError }) => {
        if (cancelled) {
          return;
        }
        setOccupiedSlots(slots);
        setSlotError(fetchError);
      })
      .finally(() => {
        if (!cancelled) {
          setSlotLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, scheduledDate, vetId]);

  const hasAvailableSlots = useMemo(
    () =>
      Boolean(scheduledDate) &&
      TIME_SLOTS.some((slot) => !occupiedSlotSet.has(slot) && !isPastSlot(scheduledDate, slot)),
    [occupiedSlotSet, scheduledDate]
  );

  const submitApproval = async (event: FormEvent) => {
    event.preventDefault();

    if (!scheduledDate) {
      setError("Appointment date is required.");
      return;
    }
    if (!scheduledSlot) {
      setError("Select a time slot.");
      return;
    }
    if (isPastSlot(scheduledDate, scheduledSlot)) {
      setError("Cannot pick a past time slot.");
      return;
    }
    if (occupiedSlotSet.has(scheduledSlot)) {
      setError("Selected time slot is already occupied.");
      return;
    }

    setError(null);
    setSaving(true);

    const scheduledDateTime = `${scheduledDate}T${scheduledSlot}`;
    const { error: submitError } = await approveReferral({
      vetId,
      referrerVetId: referral.referrer_vet_id,
      referralDate: referral.referraldate,
      diagnosisRaw: referral.diagnosis_raw,
      scheduledDateTime,
      petOwnerId: referral.inferred_owner_id,
      petId: referral.inferred_pet_id,
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
        <button
          type="button"
          className={styles.btn}
          onClick={() => {
            setSlotLoading(Boolean(scheduledDate));
            setSlotError(null);
            setOpen(true);
          }}
        >
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
                <label className={styles.formLabel}>Appointment date</label>
                <input
                  type="date"
                  className={styles.inputControl}
                  value={scheduledDate}
                  onChange={(event) => {
                    const nextDate = event.target.value;
                    setSlotLoading(Boolean(nextDate));
                    setSlotError(null);
                    setScheduledDate(nextDate);
                  }}
                  min={minSelectableDate}
                  disabled={saving}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Time slot</label>
                <select
                  className={styles.inputControl}
                  value={scheduledSlot}
                  onChange={(event) => setScheduledSlot(event.target.value)}
                  disabled={saving}
                >
                  <option value="">{slotLoading ? "Loading slots..." : "Select a slot"}</option>
                  {TIME_SLOTS.map((slot) => {
                    const disabled =
                      !scheduledDate || occupiedSlotSet.has(slot) || isPastSlot(scheduledDate, slot);
                    return (
                      <option key={slot} value={slot} disabled={disabled}>
                        {slot}
                      </option>
                    );
                  })}
                </select>
              </div>
              {!hasAvailableSlots && !slotLoading ? (
                <p className={styles.errorText}>No available slot for the selected date.</p>
              ) : null}
              {slotError ? <p className={styles.errorText}>{slotError}</p> : null}
              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.ghost}`}
                  onClick={() => setOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.btn}
                  disabled={
                    saving ||
                    slotLoading ||
                    !scheduledDate ||
                    !scheduledSlot ||
                    occupiedSlotSet.has(scheduledSlot) ||
                    isPastSlot(scheduledDate, scheduledSlot)
                  }
                >
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
