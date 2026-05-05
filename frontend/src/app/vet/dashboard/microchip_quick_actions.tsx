"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import styles from "./vet_dashboard_page.module.css";

type MicrochipQuickActionsProps = {
  vetId: number | null;
  initialNewsCount: number;
};

type MicrochipLookupResponse = {
  chip: {
    chip_id: number;
    is_lost: boolean;
    last_known_location: string | null;
    implantation_date: string | null;
    last_lost_report_date: string | null;
  };
  pet: {
    pet_id: number;
    pet_name: string;
    species: string | null;
    breed: string | null;
    age: number | null;
  };
  owner: {
    owner_id: number;
    owner_name: string;
    owner_phone: string | null;
    owner_email: string | null;
  };
  registered_vet: {
    veterinarian_id: number | null;
    veterinarian_name: string;
    branch_id: number | null;
    branch_name: string | null;
  };
  medical_warning: string | null;
  can_send_found_news: boolean;
};

type MicrochipNewsItem = {
  news_id: number;
  created_at: string;
  is_unread: boolean;
  chip_id: number;
  pet_id: number;
  pet_name: string;
  owner_name: string;
  owner_phone: string | null;
  owner_email: string | null;
  source_vet_id: number;
  source_vet_name: string;
  source_branch_name: string | null;
  target_vet_id: number;
  notes: string;
};

type MicrochipNewsResponse = {
  unread_count: number;
  news: MicrochipNewsItem[];
};

const vetDashboardApiBaseCandidates = Array.from(
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

async function fetchMicrochipLookup(
  vetId: number,
  chipId: number
): Promise<{ data: MicrochipLookupResponse | null; error: string | null }> {
  let lastError = "Lookup request failed.";
  for (const apiBase of vetDashboardApiBaseCandidates) {
    try {
      const response = await fetch(`${apiBase}/vet/microchip/lookup?vetId=${vetId}&chipId=${chipId}`);
      const payload = (await response.json()) as MicrochipLookupResponse & { error?: unknown };
      if (!response.ok) {
        lastError = buildErrorMessage(payload, response.status);
        continue;
      }
      return { data: payload, error: null };
    } catch (error) {
      if (error instanceof Error) {
        lastError = error.message;
      }
    }
  }
  return { data: null, error: lastError };
}

async function sendFoundNews(
  vetId: number,
  chipId: number,
  notes: string
): Promise<{ error: string | null }> {
  let lastError = "Send request failed.";
  for (const apiBase of vetDashboardApiBaseCandidates) {
    try {
      const response = await fetch(`${apiBase}/vet/microchip/news/found`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vetId, chipId, notes }),
      });
      const payload = (await response.json()) as { error?: unknown };
      if (!response.ok) {
        lastError = buildErrorMessage(payload, response.status);
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

async function fetchMicrochipNews(
  vetId: number
): Promise<{ data: MicrochipNewsResponse | null; error: string | null }> {
  let lastError = "News request failed.";
  for (const apiBase of vetDashboardApiBaseCandidates) {
    try {
      const response = await fetch(`${apiBase}/vet/microchip/news?vetId=${vetId}`);
      const payload = (await response.json()) as MicrochipNewsResponse & { error?: unknown };
      if (!response.ok) {
        lastError = buildErrorMessage(payload, response.status);
        continue;
      }
      return { data: payload, error: null };
    } catch (error) {
      if (error instanceof Error) {
        lastError = error.message;
      }
    }
  }
  return { data: null, error: lastError };
}

async function markMicrochipNewsRead(vetId: number): Promise<void> {
  for (const apiBase of vetDashboardApiBaseCandidates) {
    const response = await fetch(`${apiBase}/vet/microchip/news/mark-read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vetId }),
    });
    if (response.ok) {
      return;
    }
  }
}

function formatDateTimeLabel(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MicrochipQuickActions({
  vetId,
  initialNewsCount,
}: MicrochipQuickActionsProps) {
  const [newsCount, setNewsCount] = useState(Math.max(0, initialNewsCount || 0));
  const [chipModalOpen, setChipModalOpen] = useState(false);
  const [chipInput, setChipInput] = useState("");
  const [chipLookupLoading, setChipLookupLoading] = useState(false);
  const [chipLookupError, setChipLookupError] = useState<string | null>(null);
  const [chipLookupData, setChipLookupData] = useState<MicrochipLookupResponse | null>(null);
  const [foundNewsNotes, setFoundNewsNotes] = useState("");
  const [foundNewsSending, setFoundNewsSending] = useState(false);
  const [foundNewsMessage, setFoundNewsMessage] = useState<string | null>(null);
  const [newsModalOpen, setNewsModalOpen] = useState(false);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [newsItems, setNewsItems] = useState<MicrochipNewsItem[]>([]);

  useEffect(() => {
    if (!vetId || vetId <= 0) {
      setNewsCount(0);
      return;
    }

    const storageKey = `vet_microchip_last_seen_news_id_${vetId}`;
    let cancelled = false;
    const syncFreshNewsCount = async () => {
      const { data } = await fetchMicrochipNews(vetId);
      if (!data || cancelled) {
        return;
      }

      const newestNewsId = data.news.reduce(
        (maxId, item) => Math.max(maxId, Number(item.news_id) || 0),
        0
      );

      const savedValue = window.localStorage.getItem(storageKey);
      const lastSeenNewsId = savedValue ? Number.parseInt(savedValue, 10) : NaN;

      if (!Number.isInteger(lastSeenNewsId) || lastSeenNewsId < 0) {
        window.localStorage.setItem(storageKey, String(newestNewsId));
        setNewsCount(0);
        return;
      }

      const freshCount = data.news.filter(
        (item) => Number(item.news_id) > lastSeenNewsId
      ).length;
      setNewsCount(Math.max(0, freshCount));
    };

    void syncFreshNewsCount();
    const interval = window.setInterval(() => {
      void syncFreshNewsCount();
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [vetId, initialNewsCount]);

  const canUseActions = Boolean(vetId && vetId > 0);
  const hasNews = newsCount > 0;

  const handleLookupSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canUseActions) {
      setChipLookupError("Veterinarian context is not ready yet.");
      return;
    }
    const parsedChipId = Number.parseInt(chipInput.trim(), 10);
    if (!Number.isInteger(parsedChipId) || parsedChipId <= 0) {
      setChipLookupError("Enter a valid microchip number.");
      return;
    }

    setChipLookupLoading(true);
    setChipLookupError(null);
    setFoundNewsMessage(null);
    setChipLookupData(null);
    const { data, error } = await fetchMicrochipLookup(vetId!, parsedChipId);
    setChipLookupLoading(false);
    if (!data) {
      setChipLookupError(error ?? "Lookup failed.");
      return;
    }
    setChipLookupData(data);
  };

  const handleSendFoundNews = async () => {
    if (!canUseActions || !chipLookupData) {
      return;
    }
    setFoundNewsSending(true);
    setFoundNewsMessage(null);
    const { error } = await sendFoundNews(vetId!, chipLookupData.chip.chip_id, foundNewsNotes);
    setFoundNewsSending(false);
    if (error) {
      setFoundNewsMessage(error);
      return;
    }
    setFoundNewsMessage("Found notification sent to registered veterinarian.");
  };

  const openNewsModal = async () => {
    if (!canUseActions) {
      setNewsError("Veterinarian context is not ready yet.");
      setNewsModalOpen(true);
      return;
    }
    setNewsModalOpen(true);
    setNewsLoading(true);
    setNewsError(null);
    const { data, error } = await fetchMicrochipNews(vetId!);
    setNewsLoading(false);
    if (!data) {
      setNewsError(error ?? "News could not be loaded.");
      return;
    }
    setNewsItems(data.news);
    setNewsCount(data.unread_count);
    if (data.unread_count > 0) {
      await markMicrochipNewsRead(vetId!);
      setNewsCount(0);
      setNewsItems((prev) => prev.map((item) => ({ ...item, is_unread: false })));
    }
    const newestNewsId = data.news.reduce(
      (maxId, item) => Math.max(maxId, Number(item.news_id) || 0),
      0
    );
    window.localStorage.setItem(
      `vet_microchip_last_seen_news_id_${vetId!}`,
      String(newestNewsId)
    );
  };

  return (
    <>
      <button
        type="button"
        className={`${styles.btn} ${styles.ghost} ${styles.block}`}
        onClick={() => setChipModalOpen(true)}
      >
        Check microchip
      </button>
      <button
        type="button"
        className={`${styles.btn} ${styles.ghost} ${styles.block} ${styles.quickActionNewsBtn} ${
          hasNews ? styles.quickActionNewsBtnActive : ""
        }`}
        onClick={openNewsModal}
      >
        <span>Microchip news</span>
        <span className={`${styles.newsBadge} ${hasNews ? styles.newsBadgeActive : ""}`}>
          {newsCount}
        </span>
      </button>
      <Link
        href="/vet/timeline?openReferral=1#create-referral"
        className={`${styles.btn} ${styles.ghost} ${styles.block}`}
      >
        Create referral
      </Link>

      {chipModalOpen ? (
        <div className={styles.modalBackdrop} onClick={() => (!chipLookupLoading && !foundNewsSending ? setChipModalOpen(false) : null)}>
          <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <h3 className={styles.pageTitle}>Check microchip</h3>
            <p className={styles.pageSubtitle}>Search by chip number and verify lost status from chip record.</p>

            <form onSubmit={handleLookupSubmit} className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Microchip number</label>
                <input
                  type="number"
                  className={styles.inputControl}
                  value={chipInput}
                  onChange={(event) => setChipInput(event.target.value)}
                  placeholder="e.g. 1"
                  disabled={chipLookupLoading}
                />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className={`${styles.btn} ${styles.ghost}`} onClick={() => setChipModalOpen(false)} disabled={chipLookupLoading || foundNewsSending}>
                  Close
                </button>
                <button type="submit" className={styles.btn} disabled={chipLookupLoading}>
                  {chipLookupLoading ? "Searching..." : "Search"}
                </button>
              </div>
            </form>

            {chipLookupError ? <p className={styles.errorText}>{chipLookupError}</p> : null}

            {chipLookupData ? (
              <div className={styles.tileStack}>
                <div className={styles.tile}>
                  <p className={styles.tileSub}>Chip ID: {chipLookupData.chip.chip_id}</p>
                  <p className={styles.tileSub}>Pet: {chipLookupData.pet.pet_name}</p>
                  <p className={styles.tileSub}>Owner: {chipLookupData.owner.owner_name}</p>
                  <p className={styles.tileSub}>
                    Registered vet: {chipLookupData.registered_vet.veterinarian_name} · {chipLookupData.registered_vet.branch_name ?? "-"}
                  </p>
                  <p className={styles.tileSub}>Last known location: {chipLookupData.chip.last_known_location ?? "-"}</p>
                  <p className={styles.tileSub}>Lost report date: {formatDateTimeLabel(chipLookupData.chip.last_lost_report_date)}</p>
                  <span className={`${styles.pill} ${chipLookupData.chip.is_lost ? styles.pillDanger : styles.pillOk}`}>
                    {chipLookupData.chip.is_lost ? "Reported Lost" : "Not Lost"}
                  </span>
                </div>

                {chipLookupData.medical_warning ? (
                  <div className={`${styles.tile} ${styles.microchipWarningTile}`}>
                    <div className={styles.tileTitle}>Medical warning</div>
                    <p className={styles.tileSub}>{chipLookupData.medical_warning}</p>
                  </div>
                ) : null}

                {chipLookupData.chip.is_lost && chipLookupData.can_send_found_news ? (
                  <div className={styles.tile}>
                    <label className={styles.formLabel}>Note (optional)</label>
                    <textarea
                      className={styles.inputControl}
                      rows={3}
                      value={foundNewsNotes}
                      onChange={(event) => setFoundNewsNotes(event.target.value)}
                      placeholder="Where/how the pet was found"
                      disabled={foundNewsSending}
                    />
                    <div className={styles.modalActions}>
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.quickActionNewsBtnActive}`}
                        onClick={handleSendFoundNews}
                        disabled={foundNewsSending}
                      >
                        {foundNewsSending ? "Sending..." : "Send found notification"}
                      </button>
                    </div>
                    {foundNewsMessage ? (
                      <p className={foundNewsMessage.toLowerCase().includes("sent") ? styles.tileSub : styles.errorText}>
                        {foundNewsMessage}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {newsModalOpen ? (
        <div className={styles.modalBackdrop} onClick={() => setNewsModalOpen(false)}>
          <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <h3 className={styles.pageTitle}>Microchip news</h3>
            <p className={styles.pageSubtitle}>Newest news is on top. Previously received items stay in history.</p>
            <div className={styles.modalActions}>
              <button type="button" className={`${styles.btn} ${styles.ghost}`} onClick={() => setNewsModalOpen(false)}>
                Close
              </button>
            </div>

            {newsLoading ? <p className={styles.pageSubtitle}>Loading...</p> : null}
            {newsError ? <p className={styles.errorText}>{newsError}</p> : null}

            {!newsLoading && !newsError ? (
              newsItems.length === 0 ? (
                <p className={styles.pageSubtitle}>No microchip news received yet.</p>
              ) : (
                <div className={styles.newsList}>
                  {newsItems.map((item, index) => (
                    <div
                      key={`${item.news_id}-${item.created_at}-${index}`}
                      className={`${styles.tile} ${item.is_unread ? styles.newsItemUnread : ""}`}
                    >
                      <div className={styles.newsItemHeader}>
                        <span className={styles.tileTitle}>{item.pet_name} · Chip #{item.chip_id}</span>
                        <span className={`${styles.pill} ${item.is_unread ? styles.pillWait : styles.pillInfo}`}>
                          {item.is_unread ? "New" : "Seen"}
                        </span>
                      </div>
                      <p className={styles.tileSub}>Owner: {item.owner_name}</p>
                      <p className={styles.tileSub}>Sender: {item.source_vet_name} · {item.source_branch_name || "-"}</p>
                      <p className={styles.tileSub}>Phone: {item.owner_phone || "-"} · Email: {item.owner_email || "-"}</p>
                      <p className={styles.tileSub}>Arrived: {formatDateTimeLabel(item.created_at)}</p>
                      {item.notes ? <p className={styles.tileSub}>Note: {item.notes}</p> : null}
                    </div>
                  ))}
                </div>
              )
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
