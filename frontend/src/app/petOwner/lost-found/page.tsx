"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiSend, formatDate } from "@/lib/api";

type StoredUser = {
  id?: number | string;
  role?: string;
};

type OwnerPet = {
  petid: number;
  name: string;
};

type PetChip = {
  chipid: number;
  petid: number;
  location: string | null;
  islost: boolean;
} | null;

type LostReport = {
  reportid: number;
  petname: string;
  lostdate: string;
  location: string | null;
  reportcreateddate: string;
  isfound: boolean;
};

type ReportForm = {
  petID: string;
  lostDate: string;
  location: string;
  details: string;
};

export default function LostFoundPage() {
  const router = useRouter();
  const [ownerId, setOwnerId] = useState<number | null>(null);
  const [pets, setPets] = useState<OwnerPet[]>([]);
  const [reports, setReports] = useState<LostReport[]>([]);
  const [form, setForm] = useState<ReportForm>({ petID: "", lostDate: "", location: "", details: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const savedUser = localStorage.getItem("user");
    if (!savedUser) {
      router.push("/login");
      return;
    }

    try {
      const user = JSON.parse(savedUser) as StoredUser;
      const parsedOwnerId = Number(user.id);
      if (!Number.isInteger(parsedOwnerId) || parsedOwnerId <= 0) {
        router.push("/login");
        return;
      }
      setOwnerId(parsedOwnerId);
    } catch {
      router.push("/login");
    }
  }, [router]);

  useEffect(() => {
    if (!ownerId) return;
    void loadPageData(ownerId);
  }, [ownerId]);

  async function loadPageData(currentOwnerId = ownerId) {
    if (!currentOwnerId) return;
    setLoading(true);
    try {
      const [petData, reportData] = await Promise.all([
        apiGet<OwnerPet[]>("/petOwner/pets", { ownerId: currentOwnerId }),
        apiGet<LostReport[]>("/petOwner/lost-reports", { ownerId: currentOwnerId }),
      ]);
      setPets(petData);
      setReports(reportData);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load lost and found data");
    } finally {
      setLoading(false);
    }
  }

  async function handlePetChange(petID: string) {
    setForm((current) => ({ ...current, petID }));
    setMessage("");
    if (!ownerId || !petID) return;

    try {
      const chip = await apiGet<PetChip>(`/petOwner/chip/${petID}`, { ownerId });
      if (chip?.location) {
        setForm((current) => ({ ...current, petID, location: chip.location || "" }));
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load chip information");
    }
  }

  async function submitReport(event: FormEvent) {
    event.preventDefault();
    if (!ownerId) return;

    setMessage("");
    setError("");
    try {
      await apiSend("/petOwner/lost-report", "POST", {
        ownerId,
        petID: Number(form.petID),
        lostDate: form.lostDate,
        location: form.location,
        details: form.details,
      });
      setForm({ petID: "", lostDate: "", location: "", details: "" });
      setMessage("Lost report submitted.");
      await loadPageData(ownerId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit lost report");
    }
  }

  async function markFound(reportID: number) {
    if (!ownerId) return;

    setMessage("");
    setError("");
    try {
      await apiSend(`/petOwner/lost-report/${reportID}/found`, "PUT", { ownerId });
      setMessage("Report marked as found.");
      await loadPageData(ownerId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark report as found");
    }
  }

  function exportLostReportsPdf() {
    const reportWindow = window.open("", "_blank", "width=1000,height=760");
    if (!reportWindow) {
      setError("Could not open the PDF export window. Please allow pop-ups and try again.");
      return;
    }

    reportWindow.document.write(buildLostReportsDocument(reports));
    reportWindow.document.close();
    reportWindow.focus();
    reportWindow.print();
  }

  return (
        <section className="card">
          <h1 className="page-title">Lost &amp; Found Registry</h1>
          <p className="page-subtitle">Create lost reports for your pet. Cross-branch visibility helps reunite pets with owners.</p>

          <div className="card border-dashed border-slate-300" style={{ marginBottom: 24 }}>
            <h2 className="m-0 mb-3 text-base font-bold">Create Lost Report</h2>
            <p className="muted m-0 mb-4 text-[13px]">Report a lost pet with date, last known location, and details. Linked to microchip for cross-branch lookup.</p>
            <form onSubmit={submitReport}>
              <div className="form-row">
                <div className="form-group">
                  <label>Pet</label>
                  <select required value={form.petID} onChange={(event) => void handlePetChange(event.target.value)}>
                    <option value="">Select pet</option>
                    {pets.map((pet) => (
                      <option key={pet.petid} value={pet.petid}>
                        {pet.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Lost date</label>
                  <input required type="date" value={form.lostDate} onChange={(event) => setForm((current) => ({ ...current, lostDate: event.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label>Last known location</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Main St Park, Downtown"
                  value={form.location}
                  onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Additional details</label>
                <textarea
                  placeholder="Description, distinguishing marks, collar color..."
                  value={form.details}
                  onChange={(event) => setForm((current) => ({ ...current, details: event.target.value }))}
                />
              </div>
              <button type="submit" className="btn">
                Submit lost report
              </button>
            </form>
          </div>

          {error ? <div className="mb-4 rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div> : null}
          {message ? <div className="mb-4 rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{message}</div> : null}
          {loading ? <div className="mb-4 rounded-2xl bg-white/75 p-4 text-sm font-semibold text-slate-500">Loading lost reports...</div> : null}

          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="m-0 text-base font-bold">My Lost Reports</h2>
            <button type="button" onClick={exportLostReportsPdf} className="rounded-[14px] border border-[rgba(109,40,217,0.35)] bg-[linear-gradient(135deg,rgba(109,40,217,0.12),rgba(59,130,246,0.07))] px-4 py-2.5 text-sm font-semibold text-[#0f172a] transition hover:opacity-90">
              Export reports (PDF)
            </button>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-200/70 bg-white/70">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="bg-white/70 text-xs uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-bold">Pet</th>
                  <th className="px-5 py-4 font-bold">Lost date</th>
                  <th className="px-5 py-4 font-bold">Location</th>
                  <th className="px-5 py-4 font-bold">Status</th>
                  <th className="px-5 py-4 font-bold">Created date</th>
                  <th className="px-5 py-4 font-bold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 text-slate-700">
                {reports.length === 0 ? (
                  <tr>
                    <td className="px-5 py-8 text-center text-slate-400" colSpan={6}>
                      No lost reports found.
                    </td>
                  </tr>
                ) : (
                  reports.map((report) => (
                    <tr key={report.reportid}>
                      <td className="px-5 py-4 font-bold text-slate-800">{report.petname}</td>
                      <td className="px-5 py-4">{formatDate(report.lostdate)}</td>
                      <td className="px-5 py-4">{report.location || "Not set"}</td>
                      <td className="px-5 py-4">
                        <LostStatusBadge found={report.isfound} />
                      </td>
                      <td className="px-5 py-4">{formatDate(report.reportcreateddate)}</td>
                      <td className="px-5 py-4 text-right">
                        {!report.isfound ? (
                          <button type="button" className="btn ghost" onClick={() => void markFound(report.reportid)}>
                            Mark found
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
  );
}

function LostStatusBadge({ found }: { found: boolean }) {
  const classes = found ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-orange-200 bg-orange-50 text-orange-700";
  return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${classes}`}>{found ? "Found" : "Open"}</span>;
}

function buildLostReportsDocument(reports: LostReport[]) {
  const rows = reports.map((report) => [
    report.petname,
    formatDate(report.lostdate),
    report.location || "Not set",
    report.isfound ? "Found" : "Open",
    formatDate(report.reportcreateddate),
  ]);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>My Lost Reports</title>
  <style>
    :root {
      --text: #0f172a;
      --muted: rgba(15, 23, 42, .68);
      --line: rgba(15, 23, 42, .12);
      --panel: rgba(255, 255, 255, .76);
    }
    body {
      margin: 0;
      padding: 24px;
      color: var(--text);
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
      background: #f6f8ff;
    }
    h1 { margin: 0 0 6px; font-size: 24px; }
    p { margin: 0 0 20px; color: var(--muted); font-size: 14px; }
    .table-wrap {
      border: 1px solid var(--line);
      border-radius: 16px;
      background: var(--panel);
      overflow: hidden;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    th, td {
      padding: 10px 12px;
      border-bottom: 1px solid rgba(15, 23, 42, .08);
      text-align: left;
      vertical-align: top;
    }
    th {
      color: var(--muted);
      font-weight: 600;
    }
    @page { margin: 16mm; }
  </style>
</head>
<body>
  <h1>My Lost Reports</h1>
  <p>Exported from the current lost report table.</p>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Pet</th>
          <th>Lost date</th>
          <th>Location</th>
          <th>Status</th>
          <th>Created date</th>
        </tr>
      </thead>
      <tbody>
        ${rows.length ? rows.map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="5">No lost reports found.</td></tr>`}
      </tbody>
    </table>
  </div>
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
