import Link from "next/link";

import styles from "../dashboard/vet_dashboard_page.module.css";
import { vetFetchJson, vetGetSearchValue, vetParsePositiveInt, type VetSearchValue } from "../vet_http";

type VetAppointmentsProfile = {
  veterinarian_name: string;
  branch_name: string;
};

type VetBranchOption = {
  branchid: number;
  branch_name: string;
};

type VetAppointmentItem = {
  appointmentid: number;
  datetime: string;
  pet_name: string;
  owner_name: string;
  branch_name: string;
  status: "Completed" | "Scheduled" | "Pending";
};

type VetAppointmentsResponse = {
  vet_id: number;
  filters: {
    date: string | null;
    branch_id: number | null;
  };
  profile: VetAppointmentsProfile;
  available_branches: VetBranchOption[];
  appointments: VetAppointmentItem[];
};

type VetAppointmentsPageProps = {
  searchParams?: Promise<{
    vetId?: VetSearchValue;
    date?: VetSearchValue;
    branchId?: VetSearchValue;
  }>;
};

function formatShortDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }
  return parsed.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
  });
}

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

function getStatusPillClass(status: VetAppointmentItem["status"]): string {
  if (status === "Completed") {
    return `${styles.pill} ${styles.pillOk}`;
  }
  if (status === "Scheduled") {
    return `${styles.pill} ${styles.pillWait}`;
  }
  return `${styles.pill} ${styles.pillInfo}`;
}

async function fetchVetAppointments(
  vetId: number,
  dateFilter: string | undefined,
  branchIdFilter: number | null
): Promise<{ data: VetAppointmentsResponse | null; error: string | null }> {
  const queryParts = [`vetId=${vetId}`];
  if (dateFilter) {
    queryParts.push(`date=${encodeURIComponent(dateFilter)}`);
  }
  if (branchIdFilter) {
    queryParts.push(`branchId=${branchIdFilter}`);
  }
  return vetFetchJson<VetAppointmentsResponse>(`/api/vet/appointments?${queryParts.join("&")}`);
}

export default async function VetAppointmentsPage({ searchParams }: VetAppointmentsPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const selectedVetId = vetParsePositiveInt(vetGetSearchValue(resolvedSearchParams.vetId), 1);
  const selectedDate = vetGetSearchValue(resolvedSearchParams.date);
  const selectedBranchIdRaw = vetGetSearchValue(resolvedSearchParams.branchId);
  const selectedBranchId = selectedBranchIdRaw
    ? vetParsePositiveInt(selectedBranchIdRaw, 0) || null
    : null;

  const dashboardHref = `/vet/dashboard?vetId=${selectedVetId}`;
  const timelineHref = `/vet/timeline?vetId=${selectedVetId}`;

  const { data, error } = await fetchVetAppointments(selectedVetId, selectedDate, selectedBranchId);

  if (!data) {
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <section className={styles.card}>
            <h1 className={styles.pageTitle}>Vet Appointments</h1>
            <p className={styles.pageSubtitle}>Data load failed.</p>
            <p className={styles.errorText}>{error}</p>
          </section>
        </div>
      </main>
    );
  }

  const initials = data.profile.veterinarian_name
    .split(" ")
    .map((chunk) => chunk[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

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
              <Link href={dashboardHref}>Dashboard</Link>
              <Link href={`/vet/appointments?vetId=${selectedVetId}`} className={styles.active}>
                Appointments
              </Link>
              <Link href={timelineHref}>Timeline</Link>
            </nav>
            <div className={styles.headerActions}>
              <details className={styles.profileDropdown}>
                <summary className={styles.profileTrigger}>{initials}</summary>
                <div className={styles.profileMenu}>
                  <Link href={dashboardHref}>My Profile</Link>
                  <a href="#">Logout</a>
                </div>
              </details>
            </div>
          </div>
        </header>

        <section className={styles.card}>
          <h1 className={styles.pageTitle}>My appointments</h1>
          <p className={styles.pageSubtitle}>
            Open appointments to view medical history and create visit records
          </p>

          <form method="get" className={styles.formRow}>
            <input type="hidden" name="vetId" value={selectedVetId} />
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Branch</label>
              <select
                name="branchId"
                className={styles.inputControl}
                defaultValue={data.filters.branch_id ? String(data.filters.branch_id) : ""}
              >
                <option value="">All branches</option>
                {data.available_branches.map((branch) => (
                  <option key={branch.branchid} value={branch.branchid}>
                    {branch.branch_name}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Date</label>
              <input
                type="date"
                name="date"
                className={styles.inputControl}
                defaultValue={data.filters.date ?? ""}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Apply</label>
              <button type="submit" className={styles.btn}>
                Filter
              </button>
            </div>
          </form>

          <div className={`${styles.tableWrap} ${styles.mt2}`}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Pet</th>
                  <th>Owner</th>
                  <th>Branch</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.appointments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className={styles.emptyCell}>
                      No appointments found for the selected filters.
                    </td>
                  </tr>
                ) : (
                  data.appointments.map((appointment) => (
                    <tr key={appointment.appointmentid}>
                      <td>{formatShortDate(appointment.datetime)}</td>
                      <td>{formatClock(appointment.datetime)}</td>
                      <td>{appointment.pet_name}</td>
                      <td>{appointment.owner_name}</td>
                      <td>{appointment.branch_name}</td>
                      <td>
                        <span className={getStatusPillClass(appointment.status)}>
                          {appointment.status}
                        </span>
                      </td>
                      <td>
                        <Link href={timelineHref} className={styles.btn}>
                          Open
                        </Link>
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
