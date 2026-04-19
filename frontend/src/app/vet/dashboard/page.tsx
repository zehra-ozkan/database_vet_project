import Link from "next/link";

import styles from "./vet_dashboard_page.module.css";
import { vetFetchJson, vetGetSearchValue, vetParsePositiveInt, type VetSearchValue } from "../vet_http";

type VetDashboardProfile = {
  veterinarian_name: string;
  branch_name: string | null;
  branch_location: string | null;
};

type VetDashboardMetrics = {
  todays_appointments: number;
  pending_documentation: number;
};

type VetScheduleItem = {
  appointmentid: number;
  datetime: string;
  pet_name: string;
  owner_name: string;
  status: "Completed" | "Upcoming" | "Pending";
};

type VetVaccinationItem = {
  pet_name: string;
  vaccine_name: string;
  shotdate: string | null;
  nextduedate: string | null;
  admin_vet_name: string;
  vaccination_status: string;
};

type VetDashboardResponse = {
  vet_id: number;
  selected_date: string;
  profile: VetDashboardProfile;
  metrics: VetDashboardMetrics;
  today_schedule: VetScheduleItem[];
  vaccination_records: VetVaccinationItem[];
};

type VetDashboardPageProps = {
  searchParams?: Promise<{
    vetId?: VetSearchValue;
    date?: VetSearchValue;
  }>;
};

function formatClock(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "--:--";
  }
  return parsed.toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  });
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

function withDoctorPrefix(name: string): string {
  if (name.toLowerCase().startsWith("dr.")) {
    return name;
  }
  return `Dr. ${name}`;
}

function getInitials(name: string): string {
  const parts = name
    .replace("Dr.", "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) {
    return "VT";
  }
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "");
  return initials.join("");
}

function getSchedulePillClass(status: VetScheduleItem["status"]): string {
  if (status === "Completed") {
    return `${styles.pill} ${styles.pillOk}`;
  }
  if (status === "Upcoming") {
    return `${styles.pill} ${styles.pillWait}`;
  }
  return `${styles.pill} ${styles.pillInfo}`;
}

function getVaccinationPillClass(status: string): string {
  if (status.startsWith("Overdue")) {
    return `${styles.pill} ${styles.pillDanger}`;
  }
  if (status.startsWith("Due in")) {
    return `${styles.pill} ${styles.pillWait}`;
  }
  return `${styles.pill} ${styles.pillOk}`;
}

async function fetchVetDashboardData(
  vetId: number,
  selectedDate: string | undefined
): Promise<{ data: VetDashboardResponse | null; error: string | null }> {
  const queryParts = [`vetId=${vetId}`];
  if (selectedDate) {
    queryParts.push(`date=${encodeURIComponent(selectedDate)}`);
  }
  const endpoint = `/api/vet/dashboard?${queryParts.join("&")}`;
  return vetFetchJson<VetDashboardResponse>(endpoint);
}

export default async function VetDashboardPage({ searchParams }: VetDashboardPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const selectedVetId = vetParsePositiveInt(vetGetSearchValue(resolvedSearchParams.vetId), 1);
  const selectedDate = vetGetSearchValue(resolvedSearchParams.date);
  const dashboardHref = `/vet/dashboard?vetId=${selectedVetId}`;
  const appointmentsHref = `/vet/appointments?vetId=${selectedVetId}`;
  const timelineHref = `/vet/timeline?vetId=${selectedVetId}`;

  const { data, error } = await fetchVetDashboardData(selectedVetId, selectedDate);

  if (!data) {
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <section className={styles.card}>
            <h1 className={styles.pageTitle}>Vet Dashboard</h1>
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
  const branchSubtitle = data.profile.branch_location ?? "Branch location not available";

  const vaccineSummary = Array.from(
    new Set(data.vaccination_records.map((record) => record.vaccine_name))
  )
    .slice(0, 3)
    .join(", ");

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.headerSplit}>
          <div className={styles.headerLeft}>
            <Link href={dashboardHref} className={`${styles.brand} ${styles.brandIcon}`} aria-label="Vet home">
              <div className={styles.mark} />
            </Link>
          </div>
          <div className={styles.headerRight}>
            <nav className={`${styles.nav} ${styles.navRight}`}>
              <Link href={dashboardHref} className={styles.active}>
                Dashboard
              </Link>
              <Link href={appointmentsHref}>Appointments</Link>
              <Link href={timelineHref}>Timeline</Link>
            </nav>
            <div className={styles.headerActions}>
              <details className={styles.profileDropdown}>
                <summary className={styles.profileTrigger}>{profileInitials}</summary>
                <div className={styles.profileMenu}>
                  <Link href={dashboardHref}>My Profile</Link>
                  <a href="#">Logout</a>
                </div>
              </details>
            </div>
          </div>
        </header>

        <section className={styles.hero}>
          <div className={styles.card}>
            <h1>Welcome, {vetName}</h1>
            <p className={styles.sub}>
              Document visits, prescriptions, and referrals. View pet medical history and manage
              inventory-linked prescriptions.
            </p>
            <div className={`${styles.kpiRow} ${styles.mt2}`}>
              <div className={styles.kpi}>
                <div className={styles.label}>Today&apos;s appointments</div>
                <div className={styles.value}>{data.metrics.todays_appointments}</div>
              </div>
              <div className={styles.kpi}>
                <div className={styles.label}>Pending documentation</div>
                <div className={styles.value}>{data.metrics.pending_documentation}</div>
              </div>
            </div>
          </div>
          <div className={styles.card}>
            <h2 className={styles.quickActionsTitle}>Quick actions</h2>
            <Link href={appointmentsHref} className={`${styles.btn} ${styles.block} ${styles.mt1}`}>
              Open appointments
            </Link>
            <a href="#" className={`${styles.btn} ${styles.ghost} ${styles.block} ${styles.mt1}`}>
              Create visit record
            </a>
            <Link href={timelineHref} className={`${styles.btn} ${styles.ghost} ${styles.block} ${styles.mt1}`}>
              Create referral
            </Link>
          </div>
        </section>

        <section className={styles.card}>
          <h2 className={styles.pageTitle}>Today&apos;s schedule</h2>
          <p className={styles.pageSubtitle}>{branchTitle}</p>
          <p className={styles.pageSubtitle}>{branchSubtitle}</p>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Pet</th>
                  <th>Owner</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.today_schedule.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={styles.emptyCell}>
                      No appointments found for the selected date.
                    </td>
                  </tr>
                ) : (
                  data.today_schedule.map((appointment) => (
                    <tr key={appointment.appointmentid}>
                      <td>{formatClock(appointment.datetime)}</td>
                      <td>{appointment.pet_name}</td>
                      <td>{appointment.owner_name}</td>
                      <td>
                        <span className={getSchedulePillClass(appointment.status)}>
                          {appointment.status}
                        </span>
                      </td>
                      <td>
                        <a href="#">
                          {appointment.status === "Completed" ? "View" : "Open"}
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.card}>
          <h2 className={styles.pageTitle}>Vaccination Plan &amp; Records</h2>
          <p className={styles.pageSubtitle}>
            Threshold: 30 days past due (configurable) · Owners see upcoming/overdue highlights
          </p>
          <div className={styles.vaccinationMetaPanels}>
            <div className={styles.tile}>
              <div className={styles.tileTitle}>Plan owner</div>
              <p className={styles.tileSub}>
                {vetName} · {branchTitle}
              </p>
            </div>
            <div className={styles.tile}>
              <div className={styles.tileTitle}>Current plan</div>
              <p className={styles.tileSub}>{vaccineSummary || "No vaccine record yet"}</p>
            </div>
          </div>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Pet</th>
                  <th>Vaccine</th>
                  <th>Date</th>
                  <th>Batch</th>
                  <th>Next due</th>
                  <th>Admin vet</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.vaccination_records.length === 0 ? (
                  <tr>
                    <td colSpan={7} className={styles.emptyCell}>
                      No vaccination records linked to this veterinarian.
                    </td>
                  </tr>
                ) : (
                  data.vaccination_records.map((record, index) => (
                    <tr key={`${record.pet_name}-${record.vaccine_name}-${index}`}>
                      <td>{record.pet_name}</td>
                      <td>{record.vaccine_name}</td>
                      <td>{formatShortDate(record.shotdate)}</td>
                      <td>-</td>
                      <td>{formatShortDate(record.nextduedate)}</td>
                      <td>{record.admin_vet_name}</td>
                      <td>
                        <span className={getVaccinationPillClass(record.vaccination_status)}>
                          {record.vaccination_status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
