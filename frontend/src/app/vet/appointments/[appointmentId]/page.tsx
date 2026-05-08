import Link from "next/link";
import { redirect } from "next/navigation";

import styles from "../../dashboard/vet_dashboard_page.module.css";
import {
  vetFetchJson,
  vetGetLoggedInVetId,
  vetGetSearchValue,
  vetParsePositiveInt,
  type VetSearchValue,
} from "../../vet_http";
import AppointmentActions from "./appointment_actions";
import InsertMicrochipAction from "./insert_microchip_action";

type VetAppointmentDetailPet = {
  petid: number;
  pet_name: string;
  species: string | null;
  breed: string | null;
  age: number | null;
  sex: string | null;
};

type VetAppointmentMedicalHistoryItem = {
  historyid: string;
  pastdiagnosis: string | null;
  allergies: string | null;
};

type VetAppointmentPrescriptionHistoryItem = {
  prescriptionid: number;
  prescriptiondate: string | null;
  treatment: string | null;
  medicines: string;
  veterinarian_name: string;
};

type VetAppointmentVaccinationHistoryItem = {
  recordid: number;
  shotdate: string | null;
  nextduedate: string | null;
  frequency: string | null;
  vaccine_name: string;
};

type VetAppointmentMedicineOption = {
  medicineid: number;
  name: string;
  quantity: number | null;
  status: string | null;
  category?: string | null;
};

type VetExistingVaccinationPlan = {
  planid: number;
  nextvaccinationdate: string | null;
  veterinarianid: number | null;
  veterinarian_name: string | null;
  applied_dose_count: number;
  total_dose_count: number | null;
  last_shot_date: string | null;
  latest_vaccine_id: number | null;
  latest_vaccine_name: string | null;
};

type VetAppointmentReferralTarget = {
  veterinarianid: number;
  veterinarian_name: string;
  branch_name: string;
};

type VetLowStockMedicineItem = {
  medicineid: number;
  medicinename: string;
  quantity: number | null;
  threshold: number | null;
  status: string | null;
  expiracydate: string | null;
};

type VetUnpaidBillItem = {
  billno: number;
  appointmentid: number;
  duedate: string | null;
  consultationfee: number | null;
  treatmentcost: number | null;
  medicationcost: number | null;
};

type VetAppointmentDetailResponse = {
  vet_id: number;
  appointment: {
    appointmentid: number;
    datetime: string;
    atype: string;
    vaccinationplanid: number | null;
    petownerid: number;
    owner_name: string;
    branch_name: string;
  };
  pet_options: VetAppointmentDetailPet[];
  selected_pet_id: number | null;
  selected_pet: VetAppointmentDetailPet | null;
  medical_history: VetAppointmentMedicalHistoryItem[];
  prescription_history: VetAppointmentPrescriptionHistoryItem[];
  vaccination_history: VetAppointmentVaccinationHistoryItem[];
  existing_vaccination_plans: VetExistingVaccinationPlan[];
  latest_visit_summary: {
    visitid: string;
    appointmentid: number;
    notes: string;
  } | null;
  is_completed: boolean;
  existing_bill: {
    billno: number;
    appointmentid: number;
    consultationfee: number;
    treatmentcost: number;
    medicationcost: number;
    duedate: string;
    paid: boolean;
  } | null;
  available_medicines: VetAppointmentMedicineOption[];
  low_stock_medicines: VetLowStockMedicineItem[];
  unpaid_owner_bills: VetUnpaidBillItem[];
  referral_targets: VetAppointmentReferralTarget[];
};

type AppointmentDetailPageProps = {
  params: Promise<{
    appointmentId: string;
  }>;
  searchParams?: Promise<{
    petId?: VetSearchValue;
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

function formatNullableDate(value: string | null): string {
  if (!value) {
    return "-";
  }
  return formatDate(value);
}

function formatDateTimeLocalInput(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

async function fetchVetAppointmentDetail(
  vetId: number,
  appointmentId: number,
  petId: number | null
): Promise<{ data: VetAppointmentDetailResponse | null; error: string | null }> {
  const queryParts = [`vetId=${vetId}`];
  if (petId) {
    queryParts.push(`petId=${petId}`);
  }
  return vetFetchJson<VetAppointmentDetailResponse>(
    `/api/vet/appointments/${appointmentId}/detail?${queryParts.join("&")}`
  );
}

export default async function AppointmentDetailPage({
  params,
  searchParams,
}: AppointmentDetailPageProps) {
  const selectedVetId = await vetGetLoggedInVetId();
  if (!selectedVetId) {
    redirect("/vet/dashboard");
  }

  const resolvedParams = await params;
  const appointmentId = Number.parseInt(resolvedParams.appointmentId, 10);
  if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
    redirect("/vet/appointments");
  }

  const resolvedSearchParams = (await searchParams) ?? {};
  const selectedPetIdRaw = vetGetSearchValue(resolvedSearchParams.petId);
  const selectedPetId = selectedPetIdRaw ? vetParsePositiveInt(selectedPetIdRaw, 0) || null : null;

  const { data, error } = await fetchVetAppointmentDetail(selectedVetId, appointmentId, selectedPetId);
  if (!data) {
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <section className={styles.card}>
            <h1 className={styles.pageTitle}>Appointment detail</h1>
            <p className={styles.pageSubtitle}>Data load failed.</p>
            <p className={styles.errorText}>{error}</p>
            <Link href="/vet/appointments" className={`${styles.btn} ${styles.mt2}`}>
              Back to appointments
            </Link>
          </section>
        </div>
      </main>
    );
  }

  const selectedPet = data.selected_pet;
  const petLabel = selectedPet
    ? `${selectedPet.pet_name} · ${selectedPet.species ?? "-"} · ${selectedPet.breed ?? "-"}`
    : "No pet linked";
  const latestVisitNotes = data.latest_visit_summary?.notes ?? "";
  const defaultAppointmentDateTime = formatDateTimeLocalInput(data.appointment.datetime);

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.headerSplit}>
          <div className={styles.headerLeft}>
            <Link href="/vet/dashboard" className={`${styles.brand} ${styles.brandIcon}`} aria-label="Vet home">
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
          <div className={styles.eventHeader}>
            <h1 className={styles.pageTitle}>
              {data.is_completed ? "Appointment Detail" : "Appointment Detail · Visit Record"}
            </h1>
            <Link href="/vet/appointments" className={`${styles.btn} ${styles.ghost}`}>
              Back to appointments
            </Link>
          </div>
          <p className={styles.pageSubtitle}>
            {data.is_completed
              ? `Appointment #${data.appointment.appointmentid} · This appointment is completed.`
              : `Appointment #${data.appointment.appointmentid} · Use this page to save visit summary, prescriptions, referrals, and billing.`}
          </p>
          <div className={`${styles.tileStack} ${styles.mt2}`}>
            <div className={styles.tile}>
              <div className={styles.tileTitle}>Pet selection</div>
              <form method="get" className={styles.appointmentPetSelectionRow}>
                <div className={styles.appointmentPetSelectionField}>
                  <label className={styles.formLabel}>Pet</label>
                  <select
                    className={styles.inputControl}
                    name="petId"
                    defaultValue={data.selected_pet_id ? String(data.selected_pet_id) : ""}
                  >
                    {data.pet_options.map((pet) => (
                      <option key={pet.petid} value={pet.petid}>
                        {pet.pet_name}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" className={`${styles.btn} ${styles.appointmentPetSelectionSubmit}`}>
                  Load pet data
                </button>
              </form>
            </div>
            <div className={styles.tile}>
              <div className={styles.tileTitle}>Appointment summary</div>
              <p className={styles.tileSub}>Owner: {data.appointment.owner_name}</p>
              <p className={styles.tileSub}>Pet: {petLabel}</p>
              <p className={styles.tileSub}>
                Date/time: {formatDate(data.appointment.datetime)} · {formatClock(data.appointment.datetime)}
              </p>
              <p className={styles.tileSub}>Type: {data.appointment.atype}</p>
              <p className={styles.tileSub}>Branch: {data.appointment.branch_name}</p>
              <p className={styles.tileSub}>
                Status:{" "}
                <span className={data.is_completed ? `${styles.pill} ${styles.pillOk}` : `${styles.pill} ${styles.pillWait}`}>
                  {data.is_completed ? "Completed" : "Pending"}
                </span>
              </p>
              {data.existing_bill ? (
                <p className={styles.tileSub}>
                  Bill #{data.existing_bill.billno} · Due: {formatDate(data.existing_bill.duedate)}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <section className={styles.card}>
          <h2 className={styles.pageTitle}>Owner financial + branch stock checks</h2>
          <div className={`${styles.vaccinationMetaPanels} ${styles.mt1}`}>
            <div className={styles.tile}>
              <div className={styles.tileTitle}>Owner unpaid bills</div>
              <p className={styles.tileSub}>Count: {data.unpaid_owner_bills.length}</p>
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>Bill</th>
                      <th>Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.unpaid_owner_bills.length === 0 ? (
                      <tr>
                        <td colSpan={2} className={styles.emptyCell}>
                          No unpaid bill found for this owner.
                        </td>
                      </tr>
                    ) : (
                      data.unpaid_owner_bills.slice(0, 6).map((bill) => (
                        <tr key={`${bill.billno}-${bill.appointmentid}`}>
                          <td>#{bill.billno}</td>
                          <td>{formatNullableDate(bill.duedate)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={styles.tile}>
              <div className={styles.tileTitle}>Low stock medicines (branch)</div>
              <p className={styles.tileSub}>Count: {data.low_stock_medicines.length}</p>
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>Medicine</th>
                      <th>Qty</th>
                      <th>Threshold</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.low_stock_medicines.length === 0 ? (
                      <tr>
                        <td colSpan={3} className={styles.emptyCell}>
                          No low-stock medicine found.
                        </td>
                      </tr>
                    ) : (
                      data.low_stock_medicines.slice(0, 6).map((medicine) => (
                        <tr key={medicine.medicineid}>
                          <td>{medicine.medicinename}</td>
                          <td>{medicine.quantity ?? "-"}</td>
                          <td>{medicine.threshold ?? "-"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.card}>
          <h2 className={styles.pageTitle}>Medical history snapshot</h2>
          <div className={`${styles.tableWrap} ${styles.mt1}`}>
            <table>
              <thead>
                <tr>
                  <th>Past diagnosis</th>
                  <th>Allergies</th>
                </tr>
              </thead>
              <tbody>
                {data.medical_history.length === 0 ? (
                  <tr>
                    <td colSpan={2} className={styles.emptyCell}>
                      No medical history found for selected pet.
                    </td>
                  </tr>
                ) : (
                  data.medical_history.map((item) => (
                    <tr key={item.historyid}>
                      <td>{item.pastdiagnosis ?? "-"}</td>
                      <td>{item.allergies ?? "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.card}>
          <h2 className={styles.pageTitle}>Prescription history</h2>
          <div className={`${styles.tableWrap} ${styles.mt1}`}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Treatment</th>
                  <th>Medicines</th>
                  <th>Veterinarian</th>
                </tr>
              </thead>
              <tbody>
                {data.prescription_history.length === 0 ? (
                  <tr>
                    <td colSpan={4} className={styles.emptyCell}>
                      No prescription history found.
                    </td>
                  </tr>
                ) : (
                  data.prescription_history.map((item) => (
                    <tr key={item.prescriptionid}>
                      <td>{formatNullableDate(item.prescriptiondate)}</td>
                      <td>{item.treatment ?? "-"}</td>
                      <td>{item.medicines || "-"}</td>
                      <td>{item.veterinarian_name}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.card}>
          <h2 className={styles.pageTitle}>Vaccination history</h2>
          <div className={`${styles.tableWrap} ${styles.mt1}`}>
            <table>
              <thead>
                <tr>
                  <th>Vaccine</th>
                  <th>Shot date</th>
                  <th>Next due date</th>
                  <th>Frequency</th>
                </tr>
              </thead>
              <tbody>
                {data.vaccination_history.length === 0 ? (
                  <tr>
                    <td colSpan={4} className={styles.emptyCell}>
                      No vaccination records found.
                    </td>
                  </tr>
                ) : (
                  data.vaccination_history.map((item) => (
                    <tr key={item.recordid}>
                      <td>{item.vaccine_name}</td>
                      <td>{formatNullableDate(item.shotdate)}</td>
                      <td>{formatNullableDate(item.nextduedate)}</td>
                      <td>{item.frequency ?? "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {!data.is_completed ? (
          <>
            {data.selected_pet_id ? (
              <InsertMicrochipAction appointmentId={appointmentId} vetId={selectedVetId} />
            ) : null}
            <AppointmentActions
              key={`actions-${appointmentId}-${data.selected_pet_id ?? 0}-${data.latest_visit_summary?.visitid ?? "none"}-${data.is_completed ? "done" : "open"}`}
              appointmentId={appointmentId}
              vetId={selectedVetId}
              selectedPetId={data.selected_pet_id}
              defaultVisitNotes={latestVisitNotes}
              defaultAppointmentDateTime={defaultAppointmentDateTime}
              isCompleted={data.is_completed}
              medicines={data.available_medicines}
              existingVaccinationPlans={data.existing_vaccination_plans}
              referralTargets={data.referral_targets}
            />
          </>
        ) : null}

        <section className={styles.card}>
          <div className={`${styles.eventActionRow} ${styles.mt1}`}>
            <Link href="/vet/appointments" className={`${styles.btn} ${styles.ghost}`}>
              Back to appointments
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
