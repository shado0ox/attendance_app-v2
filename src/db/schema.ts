import { pgTable, serial, text, doublePrecision, jsonb, timestamp } from 'drizzle-orm/pg-core';

// 0. Companies / Tenants (for subscription/multi-tenancy)
export const companies = pgTable('companies', {
  id: text('id').primaryKey(), // unique company slug/id
  name: text('name').notNull(),
  logoUrl: text('logo_url').default(''),
  subscriptionStatus: text('subscription_status').default('active'), // 'active', 'expired', 'suspended', 'trial'
  subscriptionExpiresAt: timestamp('subscription_expires_at'),
  monthlyFee: text('monthly_fee').default('100'),
  adminUsername: text('admin_username').notNull(),
  adminPassword: text('admin_password').notNull(),
  companyCode: text('company_code').default('0'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 1. System data (to hold departments, employees, shiftTypes, schedule, settings in a key-value style)
export const systemData = pgTable('system_data', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 2. Administrators
export const admins = pgTable('admins', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  username: text('username').notNull(),
  password: text('password').notNull(),
  companyId: text('company_id').default('default'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 3. Attendance logs
export const attendance = pgTable('attendance', {
  id: serial('id').primaryKey(),
  empId: text('emp_id').notNull(),
  empName: text('emp_name').notNull(),
  dept: text('dept').default(''),
  date: text('date').notNull(),
  companyId: text('company_id').default('default'),
  
  // Period 1
  checkIn: text('check_in'),
  checkInTs: text('check_in_ts'),
  checkOut: text('check_out'),
  checkOutTs: text('check_out_ts'),
  checkInLat: doublePrecision('check_in_lat'),
  checkInLng: doublePrecision('check_in_lng'),
  
  // Period 2 (For double shifts)
  checkIn2: text('check_in_2'),
  checkInTs2: text('check_in_ts_2'),
  checkOut2: text('check_out_2'),
  checkOutTs2: text('check_out_ts_2'),
  checkInLat2: doublePrecision('check_in_lat_2'),
  checkInLng2: doublePrecision('check_in_lng_2'),
  
  checkInLocation: text('check_in_location'),
  checkInLocation2: text('check_in_location_2'),
  checkOutLocation: text('check_out_location'),
  checkOutLocation2: text('check_out_location_2'),
  status: text('status').default('present'),
  source: text('source').default('المقر'),
  note: text('note').default(''),
  createdAt: timestamp('created_at').defaultNow(),
});

// 4. Registration requests
export const registrationRequests = pgTable('registration_requests', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'employee' or 'admin'
  username: text('username').default(''),
  phone: text('phone').notNull(),
  password: text('password').notNull(),
  status: text('status').default('pending'), // 'pending', 'approved', 'rejected'
  companyId: text('company_id').default('default'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 5. Employee requests (leaves, shifts, swapping, etc.)
export const requests = pgTable('requests', {
  id: serial('id').primaryKey(),
  empId: text('emp_id').notNull(),
  empName: text('emp_name').notNull(),
  dept: text('dept').default(''),
  date: text('date').notNull(),
  type: text('type').notNull(), // 'leave', 'swap', 'shift_change', 'attendance_adjustment'
  notes: text('notes').default(''),
  status: text('status').default('pending'), // 'pending', 'approved', 'rejected'
  companyId: text('company_id').default('default'),
  
  // Swap requests
  swapWithEmpId: text('swap_with_emp_id'),
  swapWithEmpName: text('swap_with_emp_name'),
  
  // Shift change requests
  targetShift: text('target_shift'),
  
  // Attendance adjustments
  checkInTime: text('check_in_time'),
  checkOutTime: text('check_out_time'),
  
  createdAt: timestamp('created_at').defaultNow(),
});


// Append-only changes and original employee punch events.
export const auditLog = pgTable('audit_log', {
  id: serial('id').primaryKey(), companyId: text('company_id').notNull(),
  actorId: text('actor_id').notNull(), actorRole: text('actor_role').notNull(),
  action: text('action').notNull(), entityId: text('entity_id'),
  details: jsonb('details').notNull(), createdAt: timestamp('created_at').defaultNow(),
});

// Frozen monthly reports; reopening is recorded in audit_log.
export const attendanceMonths = pgTable('attendance_months', {
  key: text('key').primaryKey(),
  companyId: text('company_id').notNull(),
  month: text('month').notNull(),
  value: jsonb('value').notNull(),
});
