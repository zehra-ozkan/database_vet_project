import Link from "next/link";
import { redirect } from "next/navigation";

import styles from "../dashboard/vet_dashboard_page.module.css";
import { vetFetchJson, vetGetLoggedInVetId, vetGetSearchValue, vetParsePositiveInt, type VetSearchValue } from "../vet_http";

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
    date?: VetSearchValue;
    branchId?: VetSearchValue;
  }>;
};

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
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

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
  const selectedVetId = await vetGetLoggedInVetId();
  if (!selectedVetId) {
    redirect("/home");
  }

  const resolvedSearchParams = (await searchParams) ?? {};
  const selectedDate = vetGetSearchValue(resolvedSearchParams.date);
  const selectedBranchIdRaw = vetGetSearchValue(resolvedSearchParams.branchId);
  const selectedBranchId = selectedBranchIdRaw
    ? vetParsePositiveInt(selectedBranchIdRaw, 0) || null
    : null;

  const homeHref = "/home";
  const vaccinationsHref = "/vet/vaccinations";
  const timelineHref = "/vet/timeline";
  const profileHref = "/vet/profile";

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

  const initials = getInitials(data.profile.veterinarian_name);
  const vetName = withDoctorPrefix(data.profile.veterinarian_name);
  const todaysAppointmentsCount = data.appointments.length;
  const pendingDocumentationCount = data.appointments.filter((appointment) => appointment.status === "Pending").length;
  const schedulePreview = data.appointments.slice(0, 6);

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
              <Link href="/vet/appointments" className={styles.active}>
                Appointments
              </Link>
              <Link href={timelineHref}>Medical Records</Link>
              <Link href={vaccinationsHref}>Vaccinations</Link>
            </nav>
            <div className={styles.headerActions}>
              <details className={styles.profileDropdown}>
                <summary className={styles.profileTrigger}>{initials}</summary>
                <div className={styles.profileMenu}>
                  <Link href={profileHref}>My Profile</Link>
                  <a href="#">Logout</a>
                </div>
              </details>
            </div>
          </div>
        </header>

        <div className={styles.pageSplit}>
          <aside className={styles.sideColumn}>
            <section className={styles.card}>
              <h1>Clinic overview for today</h1>
              <p className={styles.sub}>
                Let&apos;s quickly check your appointments and notes, then jump into records and vaccinations.
              </p>
              <div className={`${styles.kpiRow} ${styles.mt2}`}>
                <div className={styles.kpi}>
                  <div className={styles.label}>Today&apos;s appointments</div>
                  <div className={styles.value}>{todaysAppointmentsCount}</div>
                </div>
                <div className={styles.kpi}>
                  <div className={styles.label}>Pending documentation</div>
                  <div className={styles.value}>{pendingDocumentationCount}</div>
                </div>
              </div>
            </section>

            <section className={styles.card}>
              <h2 className={styles.quickActionsTitle}>Quick actions</h2>
              <Link href="/vet/appointments" className={`${styles.btn} ${styles.block} ${styles.mt1}`}>
                Open appointments
              </Link>
              <Link href="/vet/appointments" className={`${styles.btn} ${styles.ghost} ${styles.block} ${styles.mt1}`}>
                Create visit record
              </Link>
              <Link href="/vet/timeline" className={`${styles.btn} ${styles.ghost} ${styles.block} ${styles.mt1}`}>
                Create referral
              </Link>
            </section>

            <section className={styles.card}>
              <h2 className={styles.pageTitle}>Today&apos;s schedule</h2>
              <p className={styles.pageSubtitle}>{data.profile.branch_name}</p>
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Pet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedulePreview.length === 0 ? (
                      <tr>
                        <td colSpan={2} className={styles.emptyCell}>
                          No appointments found.
                        </td>
                      </tr>
                    ) : (
                      schedulePreview.map((appointment) => (
                        <tr key={`schedule-${appointment.appointmentid}`}>
                          <td>{formatClock(appointment.datetime)}</td>
                          <td>{appointment.pet_name}</td>
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
            <h1 className={styles.pageTitle}>My appointments</h1>
            <p className={styles.pageSubtitle}>
              Open appointments to view medical history and create visit records
            </p>

            <form method="get" className={styles.formRow}>
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
                <button type="submit" className={`${styles.btn} ${styles.btnCompact}`}>
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
                          <Link
                            href={{
                              pathname: `/vet/appointments/${appointment.appointmentid}`,
                              query: {
                                petName: appointment.pet_name,
                                ownerName: appointment.owner_name,
                                datetime: appointment.datetime,
                                branchName: appointment.branch_name,
                                status: appointment.status,
                                type: "Consultation",
                              },
                            }}
                            className={styles.btn}
                          >
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
      </div>
    </main>
  );
}
