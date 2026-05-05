import Link from "next/link";
import { redirect } from "next/navigation";

import styles from "../dashboard/vet_dashboard_page.module.css";
import { vetFetchJson, vetGetLoggedInVetId, vetGetSearchValue, vetParsePositiveInt, type VetSearchValue } from "../vet_http";
import ChipStatusReporter from "./chip_status_reporter";
import LogoutMenuLink from "../logout_menu_link";
import ReferralCreator from "./referral_creator";

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
  linked_pet_id: number | null;
  linked_pet_name: string | null;
  owner_level_event: boolean;
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

type VetTimelineReferralTarget = {
  veterinarianid: number;
  veterinarian_name: string;
  branch_name: string;
};

type MicrochipStatus = "Active" | "Reported Lost" | "Found";

type VetTimelineMicrochip = {
  chip_id: string | null;
  implantation_date: string | null;
  registered_by: string | null;
  status: MicrochipStatus | null;
  last_known_location: string | null;
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
  referral_targets: VetTimelineReferralTarget[];
  microchip?: VetTimelineMicrochip | null;
  timeline_notice?: string | null;
};

type VetTimelinePageProps = {
  searchParams?: Promise<{
    petId?: VetSearchValue;
    openReferral?: VetSearchValue;
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
  appointmentId: number | null;
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

function getMicrochipStatusPillClass(status: MicrochipStatus): string {
  if (status === "Reported Lost") {
    return `${styles.pill} ${styles.pillDanger}`;
  }
  if (status === "Found") {
    return `${styles.pill} ${styles.pillInfo}`;
  }
  return `${styles.pill} ${styles.pillOk}`;
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
    title: `Visit #${visit.appointmentid}`,
    body: `${
      visit.owner_level_event
        ? "Owner-level appointment (appointment-to-pet relation is not defined in schema)."
        : `Pet: ${visit.linked_pet_name ?? "-"}`
    }${visit.notes ? ` · Notes: ${visit.notes}` : ""}`,
    pillClass: `${styles.pill} ${styles.pillInfo}`,
    appointmentId: visit.appointmentid,
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
    appointmentId: null,
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
    appointmentId: null,
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
  const selectedVetId = await vetGetLoggedInVetId();
  if (!selectedVetId) {
    redirect("/vet/dashboard");
  }

  const resolvedSearchParams = (await searchParams) ?? {};
  const requestedPetIdRaw = vetGetSearchValue(resolvedSearchParams.petId);
  const requestedPetId = requestedPetIdRaw ? vetParsePositiveInt(requestedPetIdRaw, 0) || null : null;
  const requestedOpenReferralRaw = vetGetSearchValue(resolvedSearchParams.openReferral);
  const autoOpenReferral =
    requestedOpenReferralRaw === "1" ||
    requestedOpenReferralRaw?.toLowerCase() === "true";

  const homeHref = "/vet/dashboard";
  const vaccinationsHref = "/vet/vaccinations";
  const appointmentsHref = "/vet/appointments";
  const profileHref = "/vet/profile";

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

  const initials = getInitials(data.profile.veterinarian_name);
  const vetName = withDoctorPrefix(data.profile.veterinarian_name);

  const timelineCards = buildTimelineCards(
    data.visit_events,
    data.vaccination_records,
    data.prescription_events
  );
  const timelineEventCount = timelineCards.length;
  const referralCount = data.referral_events.length;
  const visitPreview = data.visit_events.slice(0, 6);
  const hasMicrochipRecord = Boolean(data.microchip);
  const microchipSnapshot = {
    chipId: data.microchip?.chip_id ?? null,
    implantationDate: data.microchip?.implantation_date ?? null,
    registeredBy: data.microchip?.registered_by ?? null,
    status: data.microchip?.status ?? null,
    lastKnownLocation: data.microchip?.last_known_location ?? null,
  };
  const canMarkFound =
    Boolean(hasMicrochipRecord) &&
    microchipSnapshot.status === "Reported Lost";

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
              <Link href="/vet/timeline" className={styles.active}>
                Medical Records
              </Link>
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
              <h1>Medical records overview</h1>
              <p className={styles.sub}>
                Track visits, prescriptions, and vaccination history for the selected pet.
              </p>
              {data.timeline_notice ? (
                <p className={styles.pageSubtitle}>{data.timeline_notice}</p>
              ) : null}
              <div className={`${styles.kpiRow} ${styles.mt2}`}>
                <div className={styles.kpi}>
                  <div className={styles.label}>Timeline events</div>
                  <div className={styles.value}>{timelineEventCount}</div>
                </div>
                <div className={styles.kpi}>
                  <div className={styles.label}>Referral records</div>
                  <div className={styles.value}>{referralCount}</div>
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
              <h2 className={styles.pageTitle}>Recent visits</h2>
              <p className={styles.pageSubtitle}>{data.selected_pet?.pet_name ?? data.profile.branch_name}</p>
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Pet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visitPreview.length === 0 ? (
                      <tr>
                        <td colSpan={2} className={styles.emptyCell}>
                          No visit event found.
                        </td>
                      </tr>
                    ) : (
                      visitPreview.map((visit) => (
                        <tr key={`visit-preview-${visit.appointmentid}`}>
                          <td>{formatClock(visit.datetime)}</td>
                          <td>
                            {visit.linked_pet_name ??
                              (visit.owner_level_event ? "Owner-level (pet unspecified)" : "-")}
                          </td>
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
              <h1 className={styles.pageTitle}>Medical Timeline</h1>
              <p className={styles.pageSubtitle}>
                Complete history: diagnoses, prescriptions, vaccinations, referrals
              </p>

              <form method="get" className={styles.formRow}>
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
                  <button type="submit" className={`${styles.btn} ${styles.btnCompact}`}>
                    Load timeline
                  </button>
                </div>
              </form>
            </section>

            {data.selected_pet && (
              <section className={styles.card}>
                <h2 className={styles.pageTitle}>Selected Pet</h2>
                <div className={styles.tile}>
                  <div className={styles.tileTitle}>{data.selected_pet.pet_name}</div>
                  <p className={styles.tileSub}>
                    {data.selected_pet.species ?? "-"} · {data.selected_pet.breed ?? "-"} · Age:{" "}
                    {data.selected_pet.age ?? "-"} · Owner: {data.selected_pet.owner_name}
                  </p>
                </div>
              </section>
            )}

            <div className={styles.timelinePairGrid}>
              <section className={styles.card}>
                <h2 className={styles.pageTitle}>Microchip Information</h2>
                <div className={styles.tile}>
                  {hasMicrochipRecord ? (
                    <>
                      <p className={styles.tileSub}>Chip ID: {microchipSnapshot.chipId}</p>
                      <p className={styles.tileSub}>
                        Implantation date: {formatDate(microchipSnapshot.implantationDate)}
                      </p>
                      <p className={styles.tileSub}>Registered by: {microchipSnapshot.registeredBy}</p>
                      <p className={styles.tileSub}>
                        Status:{" "}
                        {microchipSnapshot.status ? (
                          <span className={getMicrochipStatusPillClass(microchipSnapshot.status)}>
                            {microchipSnapshot.status}
                          </span>
                        ) : (
                          "-"
                        )}
                      </p>
                      <p className={styles.tileSub}>
                        Last known location: {microchipSnapshot.lastKnownLocation ?? "-"}
                      </p>
                    </>
                  ) : (
                    <p className={styles.tileSub}>No microchip record is registered for this pet.</p>
                  )}
                  {data.selected_pet_id ? (
                    <ChipStatusReporter
                      vetId={selectedVetId}
                      petId={data.selected_pet_id}
                      canMarkFound={canMarkFound}
                    />
                  ) : null}
                </div>
              </section>

              <section className={styles.card}>
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
              </section>

              <section className={styles.card}>
                <h2 className={styles.pageTitle}>Timeline Events</h2>
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
                        {event.appointmentId ? (
                          <div className={styles.eventActionRow}>
                            <Link
                              href={{
                                pathname: `/vet/appointments/${event.appointmentId}`,
                                query: data.selected_pet_id ? { petId: data.selected_pet_id } : {},
                              }}
                              className={`${styles.btn} ${styles.mt1}`}
                            >
                              Open appointment
                            </Link>
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section id="create-referral" className={styles.card}>
                <h2 className={styles.pageTitle}>Recent referrals by this veterinarian</h2>
                <ReferralCreator
                  vetId={selectedVetId}
                  referralTargets={data.referral_targets}
                  autoOpen={autoOpenReferral}
                />
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
              </section>
            </div>
          </div>
      </div>
      </div>
    </main>
  );
}

