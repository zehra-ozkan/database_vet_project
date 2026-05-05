"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./vet_dashboard_page.module.css";
import MicrochipQuickActions from "./microchip_quick_actions";

type VetDashboardProfile = {
  veterinarian_name: string;
  branch_name: string | null;
  branch_location: string | null;
};

type VetDashboardMetrics = {
  todays_appointments: number;
  upcoming_appointments: number;
  total_appointments: number;
  pending_documentation: number;
};

type VetScheduleItem = {
  appointmentid: number;
  petid: number | null;
  datetime: string;
  pet_name: string;
  owner_name: string;
  status: "Completed" | "Upcoming" | "Pending";
};

type VetHomeDashboardResponse = {
  selected_date: string;
  profile: VetDashboardProfile;
  metrics: VetDashboardMetrics;
  today_schedule: VetScheduleItem[];
  microchip_news_count?: number;
};

const vetDashboardApiBaseCandidates = Array.from(
  new Set(
    [process.env.NEXT_PUBLIC_API_URL, "http://localhost:5000/api"]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.replace(/\/$/, ""))
  )
);

function withDoctorPrefix(name: string): string {
  if (name.toLowerCase().startsWith("dr.")) {
    return name;
  }
  return `Dr. ${name}`;
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

function formatDateLabel(value: string | undefined): string {
  if (!value) {
    return "selected day";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
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

async function fetchVetHomeDashboardData(
  vetId: number
): Promise<{ data: VetHomeDashboardResponse | null; error: string | null }> {
  let lastError = "Data could not be loaded.";

  for (const apiBase of vetDashboardApiBaseCandidates) {
    try {
      const response = await fetch(`${apiBase}/vet/dashboard?vetId=${vetId}`, { cache: "no-store" });
      const payload = (await response.json()) as VetHomeDashboardResponse & { error?: unknown };
      if (!response.ok) {
        lastError = typeof payload.error === "string" ? payload.error : `HTTP ${response.status}`;
        continue;
      }
      return { data: payload, error: null };
    } catch (error) {
      if (error instanceof Error) {
        lastError = error.message;
      }
    }
  }

  return { data: null, error: lastError };
}

export default function HomePage() {
  const [userName, setUserName] = useState("");
  const [isVet, setIsVet] = useState(false);
  const [vetId, setVetId] = useState<number | null>(null);
  const [vetDashboardData, setVetDashboardData] = useState<VetHomeDashboardResponse | null>(null);
  const [vetDashboardError, setVetDashboardError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    // Check if user is logged in by looking for 'user' in localStorage
    const userStr = localStorage.getItem("user");
    if (userStr) {
      try {
        const user = JSON.parse(userStr) as { id?: number | string; name?: string; role?: string };
        document.cookie = `session_user=${encodeURIComponent(JSON.stringify(user))}; path=/; max-age=604800; samesite=lax`;
        setUserName(user.name || "User");
        const normalizedRole = typeof user.role === "string" ? user.role.trim().toLowerCase() : "";
        const userIsVet = normalizedRole === "veterinarian" || normalizedRole === "vet";
        setIsVet(userIsVet);

        if (userIsVet) {
          const parsedVetId = typeof user.id === "number" ? user.id : Number(user.id);
          setVetId(Number.isInteger(parsedVetId) && parsedVetId > 0 ? parsedVetId : null);
        } else {
          setVetId(null);
        }
      } catch {
        // If JSON parsing fails, redirect back to login
        router.push("/login");
      }
    } else {
      // Not logged in, redirect to login
      router.push("/login");
    }
  }, [router]);

  useEffect(() => {
    if (!isVet || !vetId) {
      setVetDashboardData(null);
      setVetDashboardError(null);
      return;
    }

    let cancelled = false;

    const loadVetDashboardData = async () => {
      const { data, error } = await fetchVetHomeDashboardData(vetId);
      if (cancelled) {
        return;
      }
      setVetDashboardData(data);
      setVetDashboardError(error);
    };

    void loadVetDashboardData();

    return () => {
      cancelled = true;
    };
  }, [isVet, vetId]);

  const handleLogout = () => {
    localStorage.removeItem("user");
    document.cookie = "session_user=; path=/; max-age=0; samesite=lax";
    router.push("/login");
  };

  const goToVetPage = (path: "appointments" | "timeline" | "dashboard") => {
    if (!isVet || !vetId) {
      return;
    }
    if (path === "dashboard") {
      router.push("/vet/vaccinations");
      return;
    }
    router.push(`/vet/${path}`);
  };

  // We can show a simple loading state until the client-side checks finish
  if (!userName) {
    return (
      <div className={`min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center ${styles.dashboardPageTone}`}>
        <div className="animate-pulse flex space-x-2">
          <div className={`w-3 h-3 bg-blue-500 rounded-full ${styles.loadingDotTone}`}></div>
          <div className={`w-3 h-3 bg-blue-500 rounded-full animation-delay-200 ${styles.loadingDotTone}`}></div>
          <div className={`w-3 h-3 bg-blue-500 rounded-full animation-delay-400 ${styles.loadingDotTone}`}></div>
        </div>
      </div>
    );
  }

  const vetName = withDoctorPrefix(vetDashboardData?.profile.veterinarian_name ?? userName);
  const branchTitle = vetDashboardData?.profile.branch_name ?? "No branch assigned";
  const branchSubtitle = vetDashboardData?.profile.branch_location ?? "Branch location not available";
  const todaysAppointments = vetDashboardData?.metrics.todays_appointments ?? 0;
  const upcomingAppointments = vetDashboardData?.metrics.upcoming_appointments ?? 0;
  const totalAppointments = vetDashboardData?.metrics.total_appointments ?? 0;
  const pendingDocumentation = vetDashboardData?.metrics.pending_documentation ?? 0;
  const todaySchedule = vetDashboardData?.today_schedule ?? [];
  const microchipNewsCount = vetDashboardData?.microchip_news_count ?? 0;
  const selectedDateLabel = formatDateLabel(vetDashboardData?.selected_date);

  return (
    <div className={`min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-8 font-sans transition-colors duration-300 ${styles.dashboardPageTone}`}>
      <div className={styles.dashboardContainer}>

        {/* Header Section */}
        <header className={`bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-6 sm:p-8 border border-gray-100 dark:border-gray-700 mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 ${styles.dashboardHeaderTone}`}>
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30 ${styles.dashboardHeaderIconTone}`}>
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <h1 className={`text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white tracking-tight ${styles.dashboardHeaderTitleTone}`}>
                Hello, {userName}! 👋
              </h1>
              <p className={`text-gray-500 dark:text-gray-400 text-sm mt-1 ${styles.dashboardHeaderSubtitleTone}`}>
                Welcome back to your VetChain Dashboard.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isVet ? (
              <Link
                href="/vet/profile"
                className={`px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-300 dark:hover:bg-indigo-900/40 rounded-lg font-semibold transition-colors ${styles.dashboardProfileBtnTone}`}
              >
                My Profile
              </Link>
            ) : null}
            <button
              onClick={handleLogout}
              className={`px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 rounded-lg font-semibold transition-colors flex items-center gap-2 ${styles.dashboardLogoutBtnTone}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>
        </header>

        {isVet ? (
          <div className={styles.dashboardLayout}>
            <div className={styles.dashboardMainColumn}>
              <section className={styles.hero}>
                <div className={styles.card}>
                  <h1>Your day is ready, {vetName}</h1>
                  <p className={styles.sub}>
                    Let&apos;s quickly check your appointments and notes, then jump into records and vaccinations.
                  </p>
                  <div className={`${styles.kpiRow} ${styles.mt2}`}>
                    <div className={styles.kpi}>
                      <div className={styles.label}>Today&apos;s appointments</div>
                      <div className={styles.value}>{todaysAppointments}</div>
                    </div>
                    <div className={styles.kpi}>
                      <div className={styles.label}>Upcoming appointments</div>
                      <div className={styles.value}>{upcomingAppointments}</div>
                    </div>
                    <div className={styles.kpi}>
                      <div className={styles.label}>Total appointments</div>
                      <div className={styles.value}>{totalAppointments}</div>
                    </div>
                    <div className={styles.kpi}>
                      <div className={styles.label}>Pending documentation</div>
                      <div className={styles.value}>{pendingDocumentation}</div>
                    </div>
                  </div>
                  {vetDashboardError ? <p className={styles.errorText}>{vetDashboardError}</p> : null}
                </div>
                <div className={`${styles.card} ${styles.quickActionsCard}`}>
                  <h2 className={styles.quickActionsTitle}>Quick actions</h2>
                  <div className={styles.quickActionsList}>
                    <MicrochipQuickActions vetId={vetId} initialNewsCount={microchipNewsCount} />
                  </div>
                </div>
              </section>

              <section className={`${styles.card} ${styles.mt2}`}>
                <h2 className={styles.pageTitle}>Today&apos;s schedule</h2>
                <p className={styles.pageSubtitle}>{branchTitle}</p>
                <p className={styles.pageSubtitle}>{branchSubtitle}</p>
                <p className={styles.pageSubtitle}>Selected date: {selectedDateLabel}</p>
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
                      {todaySchedule.length === 0 ? (
                        <tr>
                          <td colSpan={5} className={styles.emptyCell}>
                            No appointments found on {selectedDateLabel}.
                          </td>
                        </tr>
                      ) : (
                        todaySchedule.map((appointment) => (
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
                              <Link
                                href={{
                                  pathname: `/vet/appointments/${appointment.appointmentid}`,
                                  query: appointment.petid ? { petId: appointment.petid } : {},
                                }}
                              >
                                {appointment.status === "Completed" ? "View" : "Open"}
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

            <aside className={styles.dashboardSideColumn}>
              <div
                className={`${styles.navCard} bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow group cursor-pointer border-2 border-blue-300 dark:border-blue-700 ${styles.dashboardNavCardTone} ${styles.dashboardNavCardBlueTone}`}
                onClick={() => goToVetPage("appointments")}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    goToVetPage("appointments");
                  }
                }}
              >
                <div className={`w-10 h-10 bg-blue-50 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform ${styles.dashboardNavIconBlueTone}`}>
                  <span className="text-xl">📅</span>
                </div>
                <h3 className={`font-bold text-gray-900 dark:text-white mb-2 ${styles.dashboardNavTitleTone}`}>Appointments</h3>
                <p className={`text-gray-500 dark:text-gray-400 text-sm ${styles.dashboardNavTextTone}`}>
                  View your schedule and open appointments to create visit records.
                </p>
              </div>

              <div
                className={`${styles.navCard} bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow group cursor-pointer border-2 border-emerald-300 dark:border-emerald-700 ${styles.dashboardNavCardTone} ${styles.dashboardNavCardGreenTone}`}
                onClick={() => goToVetPage("timeline")}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    goToVetPage("timeline");
                  }
                }}
              >
                <div className={`w-10 h-10 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform ${styles.dashboardNavIconGreenTone}`}>
                  <span className="text-xl">🐾</span>
                </div>
                <h3 className={`font-bold text-gray-900 dark:text-white mb-2 ${styles.dashboardNavTitleTone}`}>Medical Records</h3>
                <p className={`text-gray-500 dark:text-gray-400 text-sm ${styles.dashboardNavTextTone}`}>
                  Access pet history, diagnoses, prescriptions, vaccinations, and referrals.
                </p>
              </div>

              <div
                className={`${styles.navCard} bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow group cursor-pointer border-2 border-violet-300 dark:border-violet-700 ${styles.dashboardNavCardTone} ${styles.dashboardNavCardPurpleTone}`}
                onClick={() => goToVetPage("dashboard")}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    goToVetPage("dashboard");
                  }
                }}
              >
                <div className={`w-10 h-10 bg-purple-50 dark:bg-purple-900/30 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform ${styles.dashboardNavIconPurpleTone}`}>
                  <span className="text-xl">💉</span>
                </div>
                <h3 className={`font-bold text-gray-900 dark:text-white mb-2 ${styles.dashboardNavTitleTone}`}>Vaccinations</h3>
                <p className={`text-gray-500 dark:text-gray-400 text-sm ${styles.dashboardNavTextTone}`}>
                  Review vaccination plans, due records, and follow-up items.
                </p>
              </div>
            </aside>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className={`bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-blue-100 dark:border-gray-700 ${styles.dashboardGuestCardTone}`}>
              <h3 className={`font-bold text-gray-900 dark:text-white mb-2 ${styles.dashboardNavTitleTone}`}>Appointments</h3>
              <p className={`text-gray-500 dark:text-gray-400 text-sm ${styles.dashboardNavTextTone}`}>View and manage your upcoming schedule.</p>
            </div>
            <div className={`bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-emerald-100 dark:border-gray-700 ${styles.dashboardGuestCardTone}`}>
              <h3 className={`font-bold text-gray-900 dark:text-white mb-2 ${styles.dashboardNavTitleTone}`}>Patients</h3>
              <p className={`text-gray-500 dark:text-gray-400 text-sm ${styles.dashboardNavTextTone}`}>Access medical records and history.</p>
            </div>
            <div className={`bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-purple-100 dark:border-gray-700 ${styles.dashboardGuestCardTone}`}>
              <h3 className={`font-bold text-gray-900 dark:text-white mb-2 ${styles.dashboardNavTitleTone}`}>Inventory</h3>
              <p className={`text-gray-500 dark:text-gray-400 text-sm ${styles.dashboardNavTextTone}`}>Check stock and order supplies.</p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

