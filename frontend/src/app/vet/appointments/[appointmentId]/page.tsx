import Link from "next/link";
import { redirect } from "next/navigation";

import styles from "../../dashboard/vet_dashboard_page.module.css";
import { vetFetchJson, vetGetLoggedInVetId, vetGetSearchValue, type VetSearchValue } from "../../vet_http";

type VetAppointmentItem = {
  appointmentid: number;
  datetime: string;
  pet_name: string;
  owner_name: string;
  branch_name: string;
  status: "Completed" | "Scheduled" | "Pending";
};

type VetAppointmentsResponse = {
  profile: {
    veterinarian_name: string;
    branch_name: string;
  };
  appointments: VetAppointmentItem[];
};

type AppointmentDetailPageProps = {
  params: Promise<{
    appointmentId: string;
  }>;
  searchParams?: Promise<{
    petName?: VetSearchValue;
    ownerName?: VetSearchValue;
    datetime?: VetSearchValue;
    branchName?: VetSearchValue;
    status?: VetSearchValue;
    type?: VetSearchValue;
  }>;
};

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }
  return parsed.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
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

async function fetchVetAppointments(vetId: number): Promise<{ data: VetAppointmentsResponse | null; error: string | null }> {
  return vetFetchJson<VetAppointmentsResponse>(`/api/vet/appointments?vetId=${vetId}`);
}

export default async function AppointmentDetailPage({ params, searchParams }: AppointmentDetailPageProps) {
  const selectedVetId = await vetGetLoggedInVetId();
  if (!selectedVetId) {
    redirect("/home");
  }

  const resolvedParams = await params;
  const appointmentId = Number.parseInt(resolvedParams.appointmentId, 10);
  if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
    redirect("/vet/appointments");
  }

  const resolvedSearchParams = (await searchParams) ?? {};
  const fallbackPetName = vetGetSearchValue(resolvedSearchParams.petName) ?? "Unknown pet";
  const fallbackOwnerName = vetGetSearchValue(resolvedSearchParams.ownerName) ?? "Unknown owner";
  const fallbackDatetime = vetGetSearchValue(resolvedSearchParams.datetime) ?? "";
  const fallbackBranchName = vetGetSearchValue(resolvedSearchParams.branchName) ?? "Unknown branch";
  const fallbackStatus = vetGetSearchValue(resolvedSearchParams.status) ?? "Pending";
  const fallbackType = vetGetSearchValue(resolvedSearchParams.type) ?? "Consultation";

  const { data, error } = await fetchVetAppointments(selectedVetId);
  const appointment = data?.appointments.find((row) => row.appointmentid === appointmentId) ?? null;

  const petName = appointment?.pet_name ?? fallbackPetName;
  const ownerName = appointment?.owner_name ?? fallbackOwnerName;
  const rawDatetime = appointment?.datetime ?? fallbackDatetime;
  const branchName = appointment?.branch_name ?? fallbackBranchName;
  const status = appointment?.status ?? fallbackStatus;
  const appointmentType = fallbackType;

  const pastDiagnoses = ["Otitis externa", "Mild gastroenteritis", "Post-op wound check"];
  const allergies = ["No confirmed allergy on file", "Food sensitivity (chicken)"];
  const recentVisits = ["Routine vaccination review", "Dermatology follow-up", "General wellness exam"];
  const vaccinationHistory = ["Rabies - up to date", "DHPP - due in 21 days", "Bordetella - completed"];

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.headerSplit}>
          <div className={styles.headerLeft}>
            <Link href="/home" className={`${styles.brand} ${styles.brandIcon}`} aria-label="Vet home">
              <div className={styles.mark} />
            </Link>
          </div>
          <div className={styles.headerRight}>
            <nav className={`${styles.nav} ${styles.navRight}`}>
              <Link href="/vet/appointments" className={styles.active}>
                Appointments
              </Link>
              <Link href="/vet/timeline">Medical Records</Link>
              <Link href="/vet/vaccinations">Vaccinations</Link>
            </nav>
          </div>
        </header>

        <section className={styles.card}>
          <h1 className={styles.pageTitle}>Appointment Detail · Visit Record</h1>
          <p className={styles.pageSubtitle}>
            Appointment #{appointmentId} · Fill diagnosis, treatment, prescription, referral, and vaccination updates.
          </p>
          {error ? <p className={styles.errorText}>{error}</p> : null}

          <div className={`${styles.vaccinationMetaPanels} ${styles.mt2}`}>
            <div className={styles.tile}>
              <div className={styles.tileTitle}>Appointment summary</div>
              <p className={styles.tileSub}>Pet: {petName}</p>
              <p className={styles.tileSub}>Owner: {ownerName}</p>
              <p className={styles.tileSub}>
                Date/time: {rawDatetime ? `${formatDate(rawDatetime)} · ${formatClock(rawDatetime)}` : "-"}
              </p>
              <p className={styles.tileSub}>Type: {appointmentType}</p>
              <p className={styles.tileSub}>Branch: {branchName}</p>
              <p className={styles.tileSub}>Status: {status}</p>
            </div>
            <div className={styles.tile}>
              <div className={styles.tileTitle}>Medical history snapshot</div>
              <p className={styles.tileSub}>Past diagnoses: {pastDiagnoses.join(" · ")}</p>
              <p className={styles.tileSub}>Allergies: {allergies.join(" · ")}</p>
              <p className={styles.tileSub}>Recent visits: {recentVisits.join(" · ")}</p>
              <p className={styles.tileSub}>Vaccination history: {vaccinationHistory.join(" · ")}</p>
            </div>
          </div>
        </section>

        <section className={styles.card}>
          <h2 className={styles.pageTitle}>Create Visit Record</h2>
          <div className={`${styles.formRow} ${styles.mt1}`}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Diagnosis</label>
              <input className={styles.inputControl} placeholder="Primary diagnosis" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Symptoms</label>
              <textarea className={styles.inputControl} rows={3} placeholder="Symptoms observed during visit" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Treatment</label>
              <textarea className={styles.inputControl} rows={3} placeholder="Treatment performed and plan" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Follow-up notes</label>
              <textarea className={styles.inputControl} rows={3} placeholder="Follow-up schedule and owner instructions" />
            </div>
          </div>
        </section>

        <section className={styles.card}>
          <h2 className={styles.pageTitle}>Prescription</h2>
          <div className={`${styles.formRow} ${styles.mt1}`}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Medicine</label>
              <input className={styles.inputControl} placeholder="Medicine name" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Dosage</label>
              <input className={styles.inputControl} placeholder="e.g. 5 mg" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Frequency</label>
              <input className={styles.inputControl} placeholder="e.g. 2x daily" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Duration</label>
              <input className={styles.inputControl} placeholder="e.g. 7 days" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Prescription notes</label>
              <textarea className={styles.inputControl} rows={3} placeholder="Special instructions for owner" />
            </div>
          </div>
        </section>

        <section className={styles.card}>
          <h2 className={styles.pageTitle}>Referral</h2>
          <div className={`${styles.formRow} ${styles.mt1}`}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Referee veterinarian / clinic</label>
              <input className={styles.inputControl} placeholder="Doctor or clinic name" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Referral reason</label>
              <input className={styles.inputControl} placeholder="Reason for referral" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Referral notes</label>
              <textarea className={styles.inputControl} rows={3} placeholder="Diagnosis summary and requested consultation" />
            </div>
          </div>
        </section>

        <section className={styles.card}>
          <h2 className={styles.pageTitle}>Vaccination</h2>
          <div className={`${styles.formRow} ${styles.mt1}`}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Vaccine</label>
              <input className={styles.inputControl} placeholder="Vaccine name" />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Shot date</label>
              <input type="date" className={styles.inputControl} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Next due date</label>
              <input type="date" className={styles.inputControl} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Vaccination notes</label>
              <textarea className={styles.inputControl} rows={3} placeholder="Plan details and follow-up reminders" />
            </div>
          </div>
        </section>

        <section className={styles.card}>
          <div className={`${styles.formRow} ${styles.mt1}`}>
            <button type="button" className={styles.btn}>
              Complete visit
            </button>
            <button type="button" className={`${styles.btn} ${styles.ghost}`}>
              Save draft
            </button>
            <Link href="/vet/appointments" className={`${styles.btn} ${styles.ghost}`}>
              Back to appointments
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
