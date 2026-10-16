export type Session = {
  token: string;
  id: string;
  companyId: string;
  name: string;
};
export type Shift = {
  id: string;
  name: string;
  start?: string;
  end?: string;
  start2?: string;
  end2?: string;
  type?: string;
};
export type Assignment = {
  date: string;
  shiftType: string;
  note: string;
  shift: Shift | null;
};
export type BreakEntry = {
  id: string;
  period: number;
  recordId: number;
  date: string;
  name: string;
  startedAt: number;
  plannedEnd: number;
  endedAt: number | null;
  lateReturnMinutes: number;
  allowedMinutes?: number;
};
export type Attendance = {
  id: number;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  checkIn2: string | null;
  checkOut2: string | null;
  checkInTs: string | null;
  checkOutTs?: string | null;
  checkInTs2?: string | null;
  checkOutTs2?: string | null;
  checkInLocation?: string;
  checkOutLocation?: string;
  checkInLocation2?: string;
  checkOutLocation2?: string;
  breaks: BreakEntry[];
};
export type Bootstrap = {
  attendanceLocations?: { id: string; name: string; lat: number; lng: number; radius: number }[];
  punchPlans?: { date: string; period: number; start: number; end: number }[];
  employee: {
    id: string;
    name: string;
    displayName: string;
    photoDataUrl?: string;
    departmentName: string;
  };
  companyName: string;
  companyLogo?: string;
  today: string;
  serverNow: number;
  schedule: Assignment[];
  records: Attendance[];
  workState: {
    workStatus: "working" | "break" | "outside";
    workStatusText: string;
    activeBreakLateMinutes: number;
  };
};
export type BreakStatus = {
  serverNow: number;
  entries: BreakEntry[];
  plans: {
    date: string;
    period: number;
    recordId: number | null;
    canStart: boolean;
    eligible: boolean;
    issue: string;
    rule: { name: string; durationMinutes: number; mode: string };
    window: { start: number; end: number } | null;
  }[];
};
export type PasskeyStatus = {
  required: boolean;
  approvedCount: number;
  pendingCount: number;
};
export type History = {
  totalMinutes: number;
  absentDays: number;
  lateDays: number;
  items: {
    date: string;
    first: { time: number; location: string } | null;
    last: { time: number; location: string } | null;
    minutes: number;
    status: string;
    lateMinutes: number;
    needsReview: boolean;
    absent: boolean;
  }[];
};
export type EmployeeRequest = {
  id: number;
  date: string;
  type: string;
  status: string;
  notes: string;
  reviewReason?: string;
};
export type EmployeeDocument = {
  id: string;
  date: string;
  requestType: string;
  status: string;
  reviewReason?: string;
  managerName?: string;
};
export type Profile = {
  id: string;
  name: string;
  displayName: string;
  phone: string;
  email: string;
  photoDataUrl: string;
  departmentName: string;
};

export type ApprovalRequest = EmployeeRequest & { empName: string; targetShift?: string; swapWithEmpName?: string; checkInTime?: string; checkOutTime?: string; period: number; checkInNextDay: boolean; checkOutNextDay: boolean };
export type ApprovalDocument = { id: number; employeeName: string; status: string; formData: Record<string,string> };
export type ApprovalInbox = { canApproveRequests: boolean; total?: number; requests: ApprovalRequest[]; documents: ApprovalDocument[] };
