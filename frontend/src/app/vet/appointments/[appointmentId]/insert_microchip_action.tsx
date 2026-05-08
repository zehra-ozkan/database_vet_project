"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../../dashboard/vet_dashboard_page.module.css";
import { vetBuildClientErrorMessage, vetBuildApiErrorMessage } from "../../vet_error_messages";

type Props = {
  appointmentId: number;
  vetId: number;
};

const clientApiBaseCandidates = Array.from(
  new Set(
    [process.env.NEXT_PUBLIC_API_URL, "http://localhost:5000/api"]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.replace(/\/$/, ""))
  )
);

export default function InsertMicrochipAction({ appointmentId, vetId }: Props) {
  const router = useRouter();
  const [chipIdInput, setChipIdInput] = useState("");
  const [chipLocation, setChipLocation] = useState("Neck");
  const [isInserting, setIsInserting] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  const handleInsert = async () => {
    setIsInserting(true);
    setMessage({ type: "", text: "" });

    let lastError = "Request failed.";
    let successMessage = "";

    for (const apiBase of clientApiBaseCandidates) {
      try {
        const res = await fetch(`${apiBase}/vet/appointments/${appointmentId}/insert-chip`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vetId: vetId,
            chipId: chipIdInput ? parseInt(chipIdInput, 10) : null,
            location: chipLocation,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          lastError = vetBuildApiErrorMessage(data, res.status, "Failed to insert microchip.");
          continue;
        }

        successMessage = `Success! Microchip inserted (ID: ${data.chip.chipid})`;
        break;
      } catch (err) {
        lastError = vetBuildClientErrorMessage(err, "Request failed.");
      }
    }

    if (successMessage) {
      setMessage({ type: "success", text: successMessage });
      setChipIdInput("");
      router.refresh();
    } else {
      setMessage({ type: "error", text: lastError });
    }
    
    setIsInserting(false);
  };

  return (
    <section className={styles.card} style={{ marginBottom: "16px" }}>
      <h2 className={styles.pageTitle} style={{ fontSize: "16px" }}>Insert Microchip</h2>
      {message.text && (
        <div style={{ color: message.type === "success" ? "#059669" : "#be123c", fontWeight: 600, marginBottom: "12px", fontSize: "13px" }}>
          {message.text}
        </div>
      )}
      <div style={{ display: "flex", gap: "16px", marginTop: "12px", alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: "200px" }}>
          <label className={styles.formLabel}>Chip ID (Optional, leave blank to auto-generate)</label>
          <input
            type="number"
            className={styles.inputControl}
            placeholder="e.g. 987654321"
            value={chipIdInput}
            onChange={(e) => setChipIdInput(e.target.value)}
            disabled={isInserting}
          />
        </div>
        <div style={{ flex: 1, minWidth: "200px" }}>
          <label className={styles.formLabel}>Location</label>
          <select className={styles.inputControl} value={chipLocation} onChange={(e) => setChipLocation(e.target.value)} disabled={isInserting}>
            <option value="Neck">Neck</option>
            <option value="Shoulder">Shoulder</option>
            <option value="Back">Back</option>
          </select>
        </div>
        <button type="button" className={styles.btn} onClick={handleInsert} disabled={isInserting} style={{ flexShrink: 0 }}>
          {isInserting ? "Inserting..." : "Save Microchip"}
        </button>
      </div>
    </section>
  );
}