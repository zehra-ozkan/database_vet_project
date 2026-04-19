import Link from "next/link";

import styles from "../dashboard/vet_dashboard_page.module.css";
import { vetFetchJson, vetGetSearchValue, vetParsePositiveInt, type VetSearchValue } from "../vet_http";

type VetTimelinePet = {
  petid: number;
  pet_name: string;
  species: string | null;
  breed: string | null;
  age: number | null;
  ownerid: number;
  owner_name: string;
};

type VetTimelinePlan = {
  planid: number;
  nextvaccinationdate: string | null;
  admin_vet_name: string;
  branch_name: string;
};

type VetTimelineVaccinationRecord = {
  recordid: number;
  shotdate: string | null;
  nextduedate: string | null;
  frequency: string | null;
  vaccine_name: string;
  admin_vet_name: string;
  branch_name: string;
};

type VetTimelineVisit = {
  appointmentid: number;
  datetime: string;
  notes: string;
  veterinarian_name: string;
  branch_name: string;
};

type VetTimelinePrescription = {
  prescriptionid: number;
  prescriptiondate: string | null;
  treatment: string | null;
  veterinarian_name: string;
  branch_name: string;
  medicines: string;
};

type VetTimelineReferral = {
  referraldate: string;
  diagnosis: string | null;
  referrer_name: string;
  referee_name: string;
};

type VetTimelineProfile = {
  veterinarian_name: string;
  branch_name: string;
};

type VetTimelineResponse = {
  vet_id: number;
  profile: VetTimelineProfile;
  selected_pet_id: number | null;
  available_pets: VetTimelinePet[];
  selected_pet: VetTimelinePet | null;
  vaccination_plans: VetTimelinePlan[];
  vaccination_records: VetTimelineVaccinationRecord[];
  visit_events: VetTimelineVisit[];
  prescription_events: VetTimelinePrescription[];
  referral_events: VetTimelineReferral[];
};

type VetTimelinePageProps = {
  searchParams?: Promise<{
    vetId?: VetSearchValue;
    petId?: VetSearchValue;
  }>;
};

type TimelineCardItem = {
  id: string;
  kind: "Visit" | "Vaccination" | "Prescription";
  sortKey: number;
  dateText: string;
  actorText: string;
  title: string;
  body: string;
  pillClass: string;
};

function formatDate(value: string | null): string {
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
    year: "numeric",
  });
}

function toSortableTimestamp(value: string | null): number {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function buildTimelineCards(
  visits: VetTimelineVisit[],
  vaccinations: VetTimelineVaccinationRecord[],
  prescriptions: VetTimelinePrescription[]
): TimelineCardItem[] {
  const visitCards: TimelineCardItem[] = visits.map((visit) => ({
    id: `visit-${visit.appointmentid}`,
    kind: "Visit",
    sortKey: toSortableTimestamp(visit.datetime),
    dateText: formatDate(visit.datetime),
    actorText: `${visit.veterinarian_name} · ${visit.branch_name}`,
    title: "Visit summary",
    body: visit.notes,
    pillClass: `${styles.pill} ${styles.pillInfo}`,
  }));

  const vaccinationCards: TimelineCardItem[] = vaccinations.map((record) => ({
    id: `vaccination-${record.recordid}`,
    kind: "Vaccination",
    sortKey: toSortableTimestamp(record.shotdate),
    dateText: formatDate(record.shotdate),
    actorText: `${record.admin_vet_name} · ${record.branch_name}`,
    title: record.vaccine_name,
    body: `Frequency: ${record.frequency ?? "-"} · Next due: ${formatDate(record.nextduedate)}`,
    pillClass: `${styles.pill} ${styles.pillOk}`,
  }));

  const prescriptionCards: TimelineCardItem[] = prescriptions.map((prescription) => ({
    id: `prescription-${prescription.prescriptionid}`,
    kind: "Prescription",
    sortKey: toSortableTimestamp(prescription.prescriptiondate),
    dateText: formatDate(prescription.prescriptiondate),
    actorText: `${prescription.veterinarian_name} · ${prescription.branch_name}`,
    title: "Prescription",
    body: `Treatment: ${prescription.treatment ?? "-"}${
      prescription.medicines ? ` · Medicines: ${prescription.medicines}` : ""
    }`,
    pillClass: `${styles.pill} ${styles.pillWait}`,
  }));

  return [...visitCards, ...vaccinationCards, ...prescriptionCards].sort(
    (left, right) => right.sortKey - left.sortKey
  );
}

async function fetchVetTimelineData(
  vetId: number,
  petId: number | null
): Promise<{ data: VetTimelineResponse | null; error: string | null }> {
  const queryParts = [`vetId=${vetId}`];
  if (petId) {
    queryParts.push(`petId=${petId}`);
  }
  return vetFetchJson<VetTimelineResponse>(`/api/vet/timeline?${queryParts.join("&")}`);
}

export default async function VetTimelinePage({ searchParams }: VetTimelinePageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const selectedVetId = vetParsePositiveInt(vetGetSearchValue(resolvedSearchParams.vetId), 1);
  const requestedPetIdRaw = vetGetSearchValue(resolvedSearchParams.petId);
  const requestedPetId = requestedPetIdRaw ? vetParsePositiveInt(requestedPetIdRaw, 0) || null : null;

  const dashboardHref = `/vet/dashboard?vetId=${selectedVetId}`;
  const appointmentsHref = `/vet/appointments?vetId=${selectedVetId}`;

  const { data, error } = await fetchVetTimelineData(selectedVetId, requestedPetId);

  if (!data) {
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <section className={styles.card}>
            <h1 className={styles.pageTitle}>Medical Timeline</h1>
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

  const timelineCards = buildTimelineCards(
    data.visit_events,
    data.vaccination_records,
    data.prescription_events
  );

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
              <Link href={appointmentsHref}>Appointments</Link>
              <Link href={`/vet/timeline?vetId=${selectedVetId}`} className={styles.active}>
                Timeline
              </Link>
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
          <h1 className={styles.pageTitle}>Medical Timeline</h1>
          <p className={styles.pageSubtitle}>
            Complete history: diagnoses, prescriptions, vaccinations, referrals
          </p>

          <form method="get" className={styles.formRow}>
            <input type="hidden" name="vetId" value={selectedVetId} />
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Pet</label>
              <select
                className={styles.inputControl}
                name="petId"
                defaultValue={data.selected_pet_id ? String(data.selected_pet_id) : ""}
              >
                {data.available_pets.map((pet) => (
                  <option key={pet.petid} value={pet.petid}>
                    {pet.pet_name}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Apply</label>
              <button type="submit" className={styles.btn}>
                Load timeline
              </button>
            </div>
          </form>

          {data.selected_pet && (
            <div className={`${styles.tile} ${styles.mt2}`}>
              <div className={styles.tileTitle}>{data.selected_pet.pet_name}</div>
              <p className={styles.tileSub}>
                {data.selected_pet.species ?? "-"} · {data.selected_pet.breed ?? "-"} · Age:{" "}
                {data.selected_pet.age ?? "-"} · Owner: {data.selected_pet.owner_name}
              </p>
            </div>
          )}

          <div className={`${styles.card} ${styles.mt2}`}>
            <div className={styles.eventHeader}>
              <div>
                <h2 className={styles.pageTitle}>Vaccination plan</h2>
                <p className={styles.pageSubtitle}>Active schedule based on species, breed, and age</p>
              </div>
            </div>
            <div className={`${styles.vaccinationMetaPanels} ${styles.mt2}`}>
              {data.vaccination_plans.length === 0 ? (
                <div className={styles.tile}>
                  <p className={styles.tileSub}>No vaccination plan defined for this pet.</p>
                </div>
              ) : (
                data.vaccination_plans.map((plan) => (
                  <div key={plan.planid} className={styles.tile}>
                    <div className={styles.tileTitle}>Plan #{plan.planid}</div>
                    <p className={styles.tileSub}>
                      Next due: {formatDate(plan.nextvaccinationdate)} · {plan.admin_vet_name} ·{" "}
                      {plan.branch_name}
                    </p>
                    <span className={`${styles.pill} ${styles.pillOk}`}>On schedule</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className={`${styles.tileStack} ${styles.mt2}`}>
            {timelineCards.length === 0 ? (
              <div className={styles.eventCard}>
                <p className={styles.mutedSmall}>No timeline event found for this pet.</p>
              </div>
            ) : (
              timelineCards.map((event) => (
                <div key={event.id} className={styles.eventCard}>
                  <div className={styles.eventHeader}>
                    <div>
                      <span className={event.pillClass}>{event.kind}</span>
                      <span className={styles.pageSubtitle} style={{ marginLeft: 8 }}>
                        {event.dateText}
                      </span>
                    </div>
                    <div className={styles.tileTitle}>{event.actorText}</div>
                  </div>
                  <h3 className={styles.eventTitle}>{event.title}</h3>
                  <p className={styles.mutedSmall}>{event.body}</p>
                </div>
              ))
            )}
          </div>

          <div className={`${styles.card} ${styles.mt2}`}>
            <h2 className={styles.pageTitle}>Recent referrals by this veterinarian</h2>
            <div className={`${styles.tableWrap} ${styles.mt1}`}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Referrer</th>
                    <th>Referee</th>
                    <th>Diagnosis</th>
                  </tr>
                </thead>
                <tbody>
                  {data.referral_events.length === 0 ? (
                    <tr>
                      <td colSpan={4} className={styles.emptyCell}>
                        No referral event found.
                      </td>
                    </tr>
                  ) : (
                    data.referral_events.map((referral, index) => (
                      <tr key={`${referral.referraldate}-${index}`}>
                        <td>{formatDate(referral.referraldate)}</td>
                        <td>{referral.referrer_name}</td>
                        <td>{referral.referee_name}</td>
                        <td>{referral.diagnosis ?? "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
