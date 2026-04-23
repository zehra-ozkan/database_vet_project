export type StatusTone = "safe" | "low_stock" | "expired" | "damaged" | "overdue" | "due_soon" | "up_to_date" | "paid" | "unpaid" | "neutral";

export interface ManagerUser {
  id: number;
  name: string;
  email: string;
  role?: string;
}

export interface DashboardSummary {
  lowstockitems: number;
  expireddamageditems: number;
  overduevaccinations: number;
  unpaidbillstotal: number;
}

export interface DashboardAlerts {
  lowStock: Array<Record<string, string | number | null>>;
  vaccinations: Array<Record<string, string | number | null>>;
  bills: Array<Record<string, string | number | null>>;
}

export interface InventoryItem {
  medicineid: number;
  name: string;
  category: string;
  branchid: number;
  branch: string;
  quantity: number;
  threshold: number;
  expirydate: string;
  status: string;
  displaystatus: StatusTone;
}

export interface ActivityItem {
  type: string;
  reference: string;
  description: string;
  activitydate: string | null;
}

export interface WasteLog {
  wastelogid: number;
  medicineid: number;
  medicinename: string;
  category: string;
  branch: string;
  status: string;
  notes: string;
}

export interface SupplyLog {
  medicineid: number;
  medicinename: string;
  branch: string;
  quantity: number;
  threshold: number;
  notes: string;
}

export interface VaccinationSummary {
  overdue: number;
  duewithin30days: number;
  uptodate: number;
  compliancerate: number;
}

export interface VaccinationRow {
  recordid: number;
  petname: string;
  ownername: string;
  species: string;
  breed: string;
  vaccinename: string;
  lastshotdate: string;
  nextduedate: string;
  status: StatusTone;
  recommendedvet: string;
  branch: string;
}

export interface BillingSummary {
  unpaidinvoicescount: number;
  paidthismonth: number;
  overduebills: number;
  averagebill: number;
}

export interface BillRow {
  billno: number;
  appointmentid: number;
  ownername: string;
  total: number;
  duedate: string;
  paid: boolean;
  status: StatusTone;
  appointmenttype: string;
  datetime: string;
}

export interface ReportCard {
  title: string;
  value: string;
  helper: string;
}
