"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "../dashboard/vet_dashboard_page.module.css";
import { vetBuildApiErrorMessage, vetBuildClientErrorMessage } from "../vet_error_messages";

type VetProfileEditable = {
  email: string | null;
  phonenumber: string | null;
  speciesexpertise: string | null;
  maxdailyappointmentlimit: number | null;
};

type VetProfileResponse = {
  message?: string;
  profile?: VetProfileEditable;
  error?: string;
};

type ProfileEditorProps = {
  vetId: number;
  initialProfile: VetProfileEditable;
};

const clientApiBaseCandidates = Array.from(
  new Set(
    [process.env.NEXT_PUBLIC_API_URL, "http://localhost:5000/api"]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.replace(/\/$/, ""))
  )
);

async function updateVetProfile(
  payload: Record<string, unknown>
): Promise<{ data: VetProfileResponse | null; error: string | null }> {
  let lastError = "Request failed.";

  for (const apiBase of clientApiBaseCandidates) {
    try {
      const response = await fetch(`${apiBase}/vet/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const responsePayload = (await response.json()) as VetProfileResponse;
      if (!response.ok) {
        lastError = vetBuildApiErrorMessage(responsePayload, response.status, "Request failed.");
        continue;
      }
      return { data: responsePayload, error: null };
    } catch (error) {
      lastError = vetBuildClientErrorMessage(error, "Request failed.");
    }
  }

  return { data: null, error: lastError };
}

export default function ProfileEditor({ vetId, initialProfile }: ProfileEditorProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [email, setEmail] = useState(initialProfile.email ?? "");
  const [phoneNumber, setPhoneNumber] = useState(initialProfile.phonenumber ?? "");
  const [speciesExpertise, setSpeciesExpertise] = useState(initialProfile.speciesexpertise ?? "");
  const [dailyLimit, setDailyLimit] = useState(
    initialProfile.maxdailyappointmentlimit ? String(initialProfile.maxdailyappointmentlimit) : ""
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setEmail(initialProfile.email ?? "");
    setPhoneNumber(initialProfile.phonenumber ?? "");
    setSpeciesExpertise(initialProfile.speciesexpertise ?? "");
    setDailyLimit(initialProfile.maxdailyappointmentlimit ? String(initialProfile.maxdailyappointmentlimit) : "");
  };

  const startEditing = () => {
    setError(null);
    setMessage(null);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    resetForm();
    setError(null);
    setMessage(null);
    setIsEditing(false);
  };

  const submitProfile = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const normalizedEmail = email.trim();
    const normalizedPhone = phoneNumber.trim();
    const normalizedSpecies = speciesExpertise.trim();
    const normalizedDailyLimitRaw = dailyLimit.trim();

    if (!normalizedEmail) {
      setError("Email is required.");
      return;
    }
    if (!normalizedPhone) {
      setError("Phone number is required.");
      return;
    }
    if (!normalizedSpecies) {
      setError("Species expertise is required.");
      return;
    }

    const parsedDailyLimit = Number.parseInt(normalizedDailyLimitRaw, 10);
    if (Number.isNaN(parsedDailyLimit) || parsedDailyLimit <= 0) {
      setError("Daily appointment limit must be a positive integer.");
      return;
    }

    setSaving(true);
    const { data, error: submitError } = await updateVetProfile({
      vetId,
      email: normalizedEmail,
      phoneNumber: normalizedPhone,
      speciesExpertise: normalizedSpecies,
      maxDailyAppointmentLimit: parsedDailyLimit,
    });
    setSaving(false);

    if (submitError) {
      setError(submitError);
      return;
    }

    setMessage(data?.message ?? "Profile updated successfully.");
    setIsEditing(false);
    router.refresh();
  };

  return (
    <section className={styles.card}>
      <div className={styles.eventHeader}>
        <div>
          <h1 className={styles.pageTitle}>My Profile</h1>
          <p className={styles.pageSubtitle}>Update your contact and practice settings.</p>
        </div>
        {isEditing ? (
          <button type="button" className={`${styles.btn} ${styles.ghost}`} onClick={cancelEditing}>
            Cancel
          </button>
        ) : (
          <button type="button" className={styles.btn} onClick={startEditing}>
            Edit profile
          </button>
        )}
      </div>

      <form onSubmit={submitProfile} className={`${styles.formRow} ${styles.mt2}`}>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Email</label>
          <input
            className={styles.inputControl}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={!isEditing || saving}
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Phone number</label>
          <input
            className={styles.inputControl}
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
            disabled={!isEditing || saving}
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Species expertise</label>
          <input
            className={styles.inputControl}
            value={speciesExpertise}
            onChange={(event) => setSpeciesExpertise(event.target.value)}
            disabled={!isEditing || saving}
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Daily appointment limit</label>
          <input
            type="number"
            min={1}
            className={styles.inputControl}
            value={dailyLimit}
            onChange={(event) => setDailyLimit(event.target.value)}
            disabled={!isEditing || saving}
          />
        </div>

        {isEditing ? (
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Save</label>
            <button type="submit" className={styles.btn} disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        ) : null}
      </form>

      {message ? <p className={styles.tileSub}>{message}</p> : null}
      {error ? <p className={styles.errorText}>{error}</p> : null}
    </section>
  );
}
