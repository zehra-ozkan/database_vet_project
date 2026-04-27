import Link from "next/link";
import { redirect } from "next/navigation";

import styles from "./vet_dashboard_page.module.css";
import { vetFetchJson, vetGetLoggedInVetId } from "../vet_http";

type VetVaccinationProfile = {
  veterinarian_name: string;
  branch_name: string | null;
};

type VetVaccinationItem = {
  pet_name: string;
  vaccine_name: string;
  shotdate: string | null;
  nextduedate: string | null;
  admin_vet_name: string;
  vaccination_status: string;
};

type VetVaccinationDashboardResponse = {
  profile: VetVaccinationProfile;
  vaccination_records: VetVaccinationItem[];
};

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
  if (status.startsWith("Overdue")) {
    return `${styles.pill} ${styles.pillDanger}`;
  }
  if (status.startsWith("Due in")) {
    return `${styles.pill} ${styles.pillWait}`;
  }
  return `${styles.pill} ${styles.pillOk}`;
}

async function fetchVetVaccinationData(
  vetId: number
): Promise<{ data: VetVaccinationDashboardResponse | null; error: string | null }> {
  return vetFetchJson<VetVaccinationDashboardResponse>(`/api/vet/dashboard?vetId=${vetId}`);
}

export default async function VetDashboardPage() {
  const selectedVetId = await vetGetLoggedInVetId();
  if (!selectedVetId) {
    redirect("/home");
  }

  const homeHref = "/home";
  const vaccinationsHref = "/vet/dashboard";
  const appointmentsHref = "/vet/appointments";
  const timelineHref = "/vet/timeline";

  const { data, error } = await fetchVetVaccinationData(selectedVetId);

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
            <Link href={homeHref} className={`${styles.brand} ${styles.brandIcon}`} aria-label="Vet home">
              <div className={styles.mark} />
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
                  <Link href={homeHref}>My Profile</Link>
                  <a href="#">Logout</a>
                </div>
              </details>
            </div>
          </div>
        </header>

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
