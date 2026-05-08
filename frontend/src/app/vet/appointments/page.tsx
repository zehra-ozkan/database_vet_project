import Link from "next/link";
import { redirect } from "next/navigation";

import styles from "../dashboard/vet_dashboard_page.module.css";
import LogoutMenuLink from "../logout_menu_link";
import { vetFetchJson, vetGetLoggedInVetId, vetGetSearchValue, vetParsePositiveInt, type VetSearchValue } from "../vet_http";
import IncomingReferralActions from "./incoming_referral_actions";
import MicrochipQuickActions from "../dashboard/microchip_quick_actions";

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
  petid: number | null;
  datetime: string;
  pet_name: string;
  owner_name: string;
  branch_name: string;
  status: "Completed" | "Scheduled" | "Pending";
};

type VetIncomingReferralItem = {
  referraldate: string;
  diagnosis: string | null;
  diagnosis_raw: string | null;
  approved: boolean;
  referrer_vet_id: number;
  referrer_name: string;
  referrer_branch_name: string;
  inferred_owner_id: number | null;
  inferred_owner_name: string | null;
  inferred_pet_id: number | null;
  inferred_vaccination_plan_id: number | null;
  inferred_appointment_type: string | null;
};

type VetAppointmentsResponse = {
  vet_id: number;
  filters: {
    start_date: string | null;
    end_date: string | null;
    branch_id: number | null;
  };
  profile: VetAppointmentsProfile;
  available_branches: VetBranchOption[];
  appointments: VetAppointmentItem[];
  incoming_referrals: VetIncomingReferralItem[];
};

type VetDashboardSnapshotScheduleItem = {
  appointmentid: number;
  datetime: string;
  pet_name: string;
  owner_name: string;
  status: "Completed" | "Upcoming" | "Pending";
};

type VetDashboardSnapshotResponse = {
  metrics: {
    todays_appointments: number;
    pending_documentation: number;
  };
  today_schedule: VetDashboardSnapshotScheduleItem[];
};

type VetAppointmentsPageProps = {
  searchParams?: Promise<{
    startDate?: VetSearchValue;
    endDate?: VetSearchValue;
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

function isSameCalendarDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
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
  startDateFilter: string | undefined,
  endDateFilter: string | undefined,
  branchIdFilter: number | null
): Promise<{ data: VetAppointmentsResponse | null; error: string | null }> {
  const queryParts = [`vetId=${vetId}`];
  if (startDateFilter) {
    queryParts.push(`startDate=${encodeURIComponent(startDateFilter)}`);
  }
  if (endDateFilter) {
    queryParts.push(`endDate=${encodeURIComponent(endDateFilter)}`);
  }
  if (branchIdFilter) {
    queryParts.push(`branchId=${branchIdFilter}`);
  }
  return vetFetchJson<VetAppointmentsResponse>(`/api/vet/appointments?${queryParts.join("&")}`);
}

async function fetchVetDashboardSnapshot(
  vetId: number
): Promise<{ data: VetDashboardSnapshotResponse | null; error: string | null }> {
  return vetFetchJson<VetDashboardSnapshotResponse>(`/api/vet/dashboard?vetId=${vetId}`);
}

export default async function VetAppointmentsPage({ searchParams }: VetAppointmentsPageProps) {
  const selectedVetId = await vetGetLoggedInVetId();
  if (!selectedVetId) {
    redirect("/vet/dashboard");
  }

  const resolvedSearchParams = (await searchParams) ?? {};
  const selectedStartDate = vetGetSearchValue(resolvedSearchParams.startDate);
  const selectedEndDate = vetGetSearchValue(resolvedSearchParams.endDate);
  const selectedBranchIdRaw = vetGetSearchValue(resolvedSearchParams.branchId);
  const selectedBranchId = selectedBranchIdRaw
    ? vetParsePositiveInt(selectedBranchIdRaw, 0) || null
    : null;

  const homeHref = "/vet/dashboard";
  const vaccinationsHref = "/vet/vaccinations";
  const timelineHref = "/vet/timeline";
  const profileHref = "/vet/profile";

  const [{ data, error }, { data: dashboardSnapshot }] = await Promise.all([
    fetchVetAppointments(selectedVetId, selectedStartDate, selectedEndDate, selectedBranchId),
    fetchVetDashboardSnapshot(selectedVetId),
  ]);

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
  const now = new Date();
  const todayAppointments = data.appointments.filter((appointment) => {
    const parsedDate = new Date(appointment.datetime);
    if (Number.isNaN(parsedDate.getTime())) {
      return false;
    }
    return isSameCalendarDay(parsedDate, now);
  });
  const todaysAppointmentsCount =
    dashboardSnapshot?.metrics.todays_appointments ?? todayAppointments.length;
  const pendingDocumentationCount =
    dashboardSnapshot?.metrics.pending_documentation ??
    todayAppointments.filter((appointment) => appointment.status === "Pending").length;
  const schedulePreview =
    dashboardSnapshot?.today_schedule?.slice(0, 6) ?? todayAppointments.slice(0, 6);

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
                  <LogoutMenuLink />
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
              <div className={styles.quickActionsList}>
                <MicrochipQuickActions vetId={selectedVetId} initialNewsCount={0} />
              </div>
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

          <div className={styles.pageSplitMain}>
            <section className={styles.card}>
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
                  <label className={styles.formLabel}>Start date</label>
                  <input
                    type="date"
                    name="startDate"
                    className={styles.inputControl}
                    defaultValue={data.filters.start_date ?? ""}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>End date</label>
                  <input
                    type="date"
                    name="endDate"
                    className={styles.inputControl}
                    defaultValue={data.filters.end_date ?? ""}
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
                                query: appointment.petid
                                  ? { petId: appointment.petid }
                                  : {},
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

            <section className={styles.card}>
              <h2 className={styles.pageTitle}>Incoming Referrals</h2>
              <p className={styles.pageSubtitle}>Referrals assigned to you by other veterinarians</p>
              <div className={`${styles.tableWrap} ${styles.mt1}`}>
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>From vet</th>
                      <th>Branch</th>
                      <th>Diagnosis</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.incoming_referrals.length === 0 ? (
                      <tr>
                        <td colSpan={5} className={styles.emptyCell}>
                          No incoming referral found.
                        </td>
                      </tr>
                    ) : (
                      data.incoming_referrals.map((referral, index) => (
                        <tr key={`${referral.referraldate}-${referral.referrer_vet_id}-${index}`}>
                          <td>{formatShortDate(referral.referraldate)}</td>
                          <td>{referral.referrer_name}</td>
                          <td>{referral.referrer_branch_name}</td>
                          <td>{referral.diagnosis ?? "-"}</td>
                          <td>
                            <IncomingReferralActions
                              vetId={selectedVetId}
                              referral={referral}
                            />
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
      </div>
    </main>
  );
}

