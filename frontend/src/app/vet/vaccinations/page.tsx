import Link from "next/link";
import { redirect } from "next/navigation";

import styles from "../dashboard/vet_dashboard_page.module.css";
import {
  vetFetchJson,
  vetGetLoggedInVetId,
  vetGetSearchValue,
  type VetSearchValue,
} from "../vet_http";
import LogoutMenuLink from "../logout_menu_link";

type VetVaccinationProfile = {
  veterinarian_name: string;
  branch_name: string | null;
};

type VetVaccinationItem = {
  petid: number;
  pet_name: string;
  vaccine_name: string;
  shotdate: string | null;
  nextduedate: string | null;
  admin_vet_name: string;
  vaccination_status: string;
};

type VetVaccinationDashboardResponse = {
  selected_date?: string;
  profile: VetVaccinationProfile;
  vaccination_records: VetVaccinationItem[];
};

type VaccinationStatusFilter = "all" | "overdue" | "due_soon" | "normal" | "unknown";

type VetDashboardPageProps = {
  searchParams?: Promise<{
    date?: VetSearchValue;
    status?: VetSearchValue;
    q?: VetSearchValue;
  }>;
};

const vaccinationStatusFilterOptions: Array<{ value: VaccinationStatusFilter; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "overdue", label: "Overdue" },
  { value: "due_soon", label: "Due soon (<=30d)" },
  { value: "normal", label: "Normal" },
  { value: "unknown", label: "Unknown" },
];

function getVaccinationStatusBucket(status: string): Exclude<VaccinationStatusFilter, "all"> {
  if (status.startsWith("Overdue")) {
    return "overdue";
  }
  if (status.startsWith("Due in")) {
    return "due_soon";
  }
  if (status === "Normal") {
    return "normal";
  }
  return "unknown";
}

function withDoctorPrefix(name: string): string {
  if (name.toLowerCase().startsWith("dr.")) {
    return name;
  }
  return `Dr. ${name}`;
}

function getInitials(name: string): string {
  const parts = name
    .replace(/^dr\.?\s*/i, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) {
    return "VT";
  }
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "");
  return initials.join("");
}

function formatShortDate(value: string | null): string {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }
  return parsed.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
  });
}

function getVaccinationPillClass(status: string): string {
  const bucket = getVaccinationStatusBucket(status);
  if (bucket === "overdue") {
    return `${styles.pill} ${styles.pillDanger}`;
  }
  if (bucket === "due_soon") {
    return `${styles.pill} ${styles.pillWait}`;
  }
  if (bucket === "unknown") {
    return `${styles.pill} ${styles.pillInfo}`;
  }
  return `${styles.pill} ${styles.pillOk}`;
}

async function fetchVetVaccinationData(
  vetId: number,
  dateFilter: string | undefined
): Promise<{ data: VetVaccinationDashboardResponse | null; error: string | null }> {
  const queryParts = [`vetId=${vetId}`];
  if (dateFilter) {
    queryParts.push(`date=${encodeURIComponent(dateFilter)}`);
  }
  return vetFetchJson<VetVaccinationDashboardResponse>(`/api/vet/dashboard?${queryParts.join("&")}`);
}

export default async function VetDashboardPage({ searchParams }: VetDashboardPageProps) {
  const selectedVetId = await vetGetLoggedInVetId();
  if (!selectedVetId) {
    redirect("/vet/dashboard");
  }

  const resolvedSearchParams = (await searchParams) ?? {};
  const dateFilterRaw = vetGetSearchValue(resolvedSearchParams.date);
  const statusFilterRaw = (vetGetSearchValue(resolvedSearchParams.status) ?? "all").toLowerCase();
  const searchQueryRaw = vetGetSearchValue(resolvedSearchParams.q) ?? "";

  const selectedStatusFilter = vaccinationStatusFilterOptions.some(
    (option) => option.value === statusFilterRaw
  )
    ? (statusFilterRaw as VaccinationStatusFilter)
    : "all";
  const normalizedSearchQuery = searchQueryRaw.trim().toLowerCase();

  const homeHref = "/vet/dashboard";
  const vaccinationsHref = "/vet/vaccinations";
  const appointmentsHref = "/vet/appointments";
  const timelineHref = "/vet/timeline";
  const profileHref = "/vet/profile";

  const { data, error } = await fetchVetVaccinationData(selectedVetId, dateFilterRaw);

  if (!data) {
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <section className={styles.card}>
            <h1 className={styles.pageTitle}>Vet Vaccinations</h1>
            <p className={styles.pageSubtitle}>Data load failed.</p>
            <p className={styles.errorText}>{error}</p>
          </section>
        </div>
      </main>
    );
  }

  const vetName = withDoctorPrefix(data.profile.veterinarian_name);
  const profileInitials = getInitials(data.profile.veterinarian_name);
  const branchTitle = data.profile.branch_name ?? "No branch assigned";
  const allVaccinationRecords = data.vaccination_records;
  const filteredVaccinationRecords = allVaccinationRecords.filter((record) => {
    const statusBucket = getVaccinationStatusBucket(record.vaccination_status);
    if (selectedStatusFilter !== "all" && statusBucket !== selectedStatusFilter) {
      return false;
    }
    if (!normalizedSearchQuery) {
      return true;
    }
    return (
      record.pet_name.toLowerCase().includes(normalizedSearchQuery) ||
      record.vaccine_name.toLowerCase().includes(normalizedSearchQuery) ||
      record.admin_vet_name.toLowerCase().includes(normalizedSearchQuery)
    );
  });

  const overdueVaccinationCount = allVaccinationRecords.filter(
    (record) => getVaccinationStatusBucket(record.vaccination_status) === "overdue"
  ).length;
  const dueSoonVaccinationCount = allVaccinationRecords.filter(
    (record) => getVaccinationStatusBucket(record.vaccination_status) === "due_soon"
  ).length;
  const normalVaccinationCount = allVaccinationRecords.filter(
    (record) => getVaccinationStatusBucket(record.vaccination_status) === "normal"
  ).length;
  const unknownVaccinationCount = allVaccinationRecords.filter(
    (record) => getVaccinationStatusBucket(record.vaccination_status) === "unknown"
  ).length;

  const vaccineSummary = Array.from(
    new Set(allVaccinationRecords.map((record) => record.vaccine_name))
  )
    .slice(0, 4)
    .join(", ");
  const vaccinationPreview = filteredVaccinationRecords.slice(0, 8);
  const selectedDateForInput = dateFilterRaw ?? data.selected_date ?? "";
  const hasActiveFilters = Boolean(
    (dateFilterRaw && dateFilterRaw.length > 0) ||
      selectedStatusFilter !== "all" ||
      normalizedSearchQuery
  );

  return (
    <main className={styles.page}>
      <div className={`${styles.container} ${styles.pageSplitContainer}`}>
        <header className={`${styles.headerSplit} ${styles.pageSplitHeader}`}>
          <div className={styles.headerLeft}>
            <Link href={homeHref} className={`${styles.brand} ${styles.brandIcon}`} aria-label="Vet home">
              <div className={styles.mark} />
              <span className={styles.brandGreeting}>Hello, {vetName}</span>
            </Link>
          </div>
          <div className={styles.headerRight}>
            <nav className={`${styles.nav} ${styles.navRight}`}>
              <Link href={appointmentsHref}>Appointments</Link>
              <Link href={timelineHref}>Medical Records</Link>
              <Link href={vaccinationsHref} className={styles.active}>
                Vaccinations
              </Link>
            </nav>
            <div className={styles.headerActions}>
              <details className={styles.profileDropdown}>
                <summary className={styles.profileTrigger}>{profileInitials}</summary>
                <div className={styles.profileMenu}>
                  <Link href={profileHref}>My Profile</Link>
                  <LogoutMenuLink />
                </div>
              </details>
            </div>
          </div>
        </header>

        <div className={styles.pageSplit}>
          <aside className={styles.sideColumn}>
            <section className={styles.card}>
              <h1>Vaccination overview</h1>
              <p className={styles.sub}>
                Review due and overdue vaccine records and complete follow-ups quickly.
              </p>
              <div className={`${styles.kpiRow} ${styles.mt2}`}>
                <div className={styles.kpi}>
                  <div className={styles.label}>Vaccination records</div>
                  <div className={styles.value}>{allVaccinationRecords.length}</div>
                </div>
                <div className={styles.kpi}>
                  <div className={styles.label}>Overdue items</div>
                  <div className={styles.value}>{overdueVaccinationCount}</div>
                </div>
              </div>
              <div className={`${styles.kpiRow} ${styles.mt1}`}>
                <div className={styles.kpi}>
                  <div className={styles.label}>Due soon</div>
                  <div className={styles.value}>{dueSoonVaccinationCount}</div>
                </div>
                <div className={styles.kpi}>
                  <div className={styles.label}>Unknown status</div>
                  <div className={styles.value}>{unknownVaccinationCount}</div>
                </div>
              </div>
            </section>

            <section className={styles.card}>
              <h2 className={styles.quickActionsTitle}>Quick actions</h2>
              <Link href={appointmentsHref} className={`${styles.btn} ${styles.block} ${styles.mt1}`}>
                Open appointments
              </Link>
              <Link href={appointmentsHref} className={`${styles.btn} ${styles.ghost} ${styles.block} ${styles.mt1}`}>
                Create visit record
              </Link>
              <Link
                href="/vet/timeline?openReferral=1#create-referral"
                className={`${styles.btn} ${styles.ghost} ${styles.block} ${styles.mt1}`}
              >
                Create referral
              </Link>
            </section>

            <section className={styles.card}>
              <h2 className={styles.pageTitle}>Priority queue</h2>
              <p className={styles.pageSubtitle}>{branchTitle}</p>
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>Pet</th>
                      <th>Vaccine</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vaccinationPreview.length === 0 ? (
                      <tr>
                        <td colSpan={3} className={styles.emptyCell}>
                          No vaccination record found.
                        </td>
                      </tr>
                    ) : (
                      vaccinationPreview.map((record, index) => (
                        <tr key={`vaccination-preview-${record.pet_name}-${index}`}>
                          <td>{record.pet_name}</td>
                          <td>{record.vaccine_name}</td>
                          <td>{record.vaccination_status}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </aside>
          <div className={styles.splitDivider} aria-hidden />

          <section className={`${styles.card} ${styles.pageSplitMain}`}>
            <h2 className={styles.pageTitle}>Vaccination Plan &amp; Records</h2>
            <p className={styles.pageSubtitle}>
              Threshold: 30 days for due-soon and automatic overdue highlights.
            </p>

            <form method="get" className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Date</label>
                <input
                  type="date"
                  name="date"
                  className={styles.inputControl}
                  defaultValue={selectedDateForInput}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Status</label>
                <select
                  name="status"
                  className={styles.inputControl}
                  defaultValue={selectedStatusFilter}
                >
                  {vaccinationStatusFilterOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Search</label>
                <input
                  type="text"
                  name="q"
                  className={styles.inputControl}
                  defaultValue={searchQueryRaw}
                  placeholder="Pet, vaccine, veterinarian"
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Apply</label>
                <button type="submit" className={`${styles.btn} ${styles.btnCompact}`}>
                  Apply filters
                </button>
              </div>
              {hasActiveFilters ? (
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Reset</label>
                  <Link href={vaccinationsHref} className={`${styles.btn} ${styles.ghost} ${styles.btnCompact}`}>
                    Clear
                  </Link>
                </div>
              ) : null}
            </form>

            <div className={styles.vaccinationMetaPanels}>
              <div className={styles.tile}>
                <div className={styles.tileTitle}>Plan owner</div>
                <p className={styles.tileSub}>
                  {vetName} · {branchTitle}
                </p>
              </div>
              <div className={styles.tile}>
                <div className={styles.tileTitle}>Current coverage</div>
                <p className={styles.tileSub}>{vaccineSummary || "No vaccine record yet"}</p>
                <p className={styles.tileSub}>
                  Normal: {normalVaccinationCount} · Filtered: {filteredVaccinationRecords.length}
                </p>
              </div>
            </div>

            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Pet</th>
                    <th>Vaccine</th>
                    <th>Shot date</th>
                    <th>Next due</th>
                    <th>Status</th>
                    <th>Admin vet</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVaccinationRecords.length === 0 ? (
                    <tr>
                      <td colSpan={7} className={styles.emptyCell}>
                        No vaccination records match selected filters.
                      </td>
                    </tr>
                  ) : (
                    filteredVaccinationRecords.map((record, index) => (
                      <tr key={`${record.petid}-${record.vaccine_name}-${index}`}>
                        <td>{record.pet_name}</td>
                        <td>{record.vaccine_name}</td>
                        <td>{formatShortDate(record.shotdate)}</td>
                        <td>{formatShortDate(record.nextduedate)}</td>
                        <td>
                          <span className={getVaccinationPillClass(record.vaccination_status)}>
                            {record.vaccination_status}
                          </span>
                        </td>
                        <td>{record.admin_vet_name}</td>
                        <td>
                          <Link href={`/vet/timeline?petId=${record.petid}`}>Open timeline</Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}


