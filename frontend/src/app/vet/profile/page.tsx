import Link from "next/link";
import { redirect } from "next/navigation";

import styles from "../dashboard/vet_dashboard_page.module.css";
import { vetFetchJson, vetGetLoggedInVetId } from "../vet_http";

type VetProfileInfo = {
  veterinarian_name: string;
  email: string | null;
  phonenumber: string | null;
  speciesexpertise: string | null;
  rating: number | null;
  maxdailyappointmentlimit: number | null;
  branch_name: string | null;
  branch_location: string | null;
};

type VetProfileResponse = {
  profile: VetProfileInfo;
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

async function fetchVetProfile(
  vetId: number
): Promise<{ data: VetProfileResponse | null; error: string | null }> {
  return vetFetchJson<VetProfileResponse>(`/api/vet/dashboard?vetId=${vetId}`);
}

export default async function VetProfilePage() {
  const selectedVetId = await vetGetLoggedInVetId();
  if (!selectedVetId) {
    redirect("/vet/dashboard");
  }

  const homeHref = "/vet/dashboard";
  const appointmentsHref = "/vet/appointments";
  const timelineHref = "/vet/timeline";
  const vaccinationsHref = "/vet/vaccinations";
  const profileHref = "/vet/profile";

  const { data, error } = await fetchVetProfile(selectedVetId);

  if (!data) {
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <section className={styles.card}>
            <h1 className={styles.pageTitle}>My Profile</h1>
            <p className={styles.pageSubtitle}>Data load failed.</p>
            <p className={styles.errorText}>{error}</p>
          </section>
        </div>
      </main>
    );
  }

  const vetName = withDoctorPrefix(data.profile.veterinarian_name);
  const initials = getInitials(data.profile.veterinarian_name);
  const branchTitle = data.profile.branch_name ?? "No branch assigned";
  const branchLocation = data.profile.branch_location ?? "Branch location not available";

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
              <Link href={vaccinationsHref}>Vaccinations</Link>
              <Link href={profileHref} className={styles.active}>
                Profile
              </Link>
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
              <h1>Profile overview</h1>
              <p className={styles.sub}>Profile data is fetched from current SQL records.</p>
              <div className={`${styles.kpiRow} ${styles.mt2}`}>
                <div className={styles.kpi}>
                  <div className={styles.label}>Rating</div>
                  <div className={styles.value}>{data.profile.rating ?? "-"}</div>
                </div>
                <div className={styles.kpi}>
                  <div className={styles.label}>Daily appointment limit</div>
                  <div className={styles.value}>{data.profile.maxdailyappointmentlimit ?? "-"}</div>
                </div>
              </div>
            </section>

            <section className={styles.card}>
              <h2 className={styles.quickActionsTitle}>Quick actions</h2>
              <Link href={appointmentsHref} className={`${styles.btn} ${styles.block} ${styles.mt1}`}>
                Open appointments
              </Link>
              <Link href={timelineHref} className={`${styles.btn} ${styles.ghost} ${styles.block} ${styles.mt1}`}>
                Open medical records
              </Link>
              <Link href={vaccinationsHref} className={`${styles.btn} ${styles.ghost} ${styles.block} ${styles.mt1}`}>
                Open vaccinations
              </Link>
            </section>

            <section className={styles.card}>
              <h2 className={styles.pageTitle}>Assigned branch</h2>
              <p className={styles.pageSubtitle}>{branchTitle}</p>
              <p className={styles.pageSubtitle}>{branchLocation}</p>
            </section>
          </aside>
          <div className={styles.splitDivider} aria-hidden />

          <section className={`${styles.card} ${styles.pageSplitMain}`}>
            <h1 className={styles.pageTitle}>My Profile</h1>
            <p className={styles.pageSubtitle}>
              Profile editing UI is ready. Save endpoint can be connected in the next step.
            </p>
            {error ? <p className={styles.errorText}>{error}</p> : null}

            <div className={`${styles.formRow} ${styles.mt2}`}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Name</label>
                <input className={styles.inputControl} defaultValue={data.profile.veterinarian_name} readOnly />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Email</label>
                <input className={styles.inputControl} defaultValue={data.profile.email ?? ""} readOnly />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Phone number</label>
                <input className={styles.inputControl} defaultValue={data.profile.phonenumber ?? ""} readOnly />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Species expertise</label>
                <input className={styles.inputControl} defaultValue={data.profile.speciesexpertise ?? ""} readOnly />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Branch</label>
                <input className={styles.inputControl} defaultValue={branchTitle} readOnly />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Branch location</label>
                <input className={styles.inputControl} defaultValue={branchLocation} readOnly />
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
