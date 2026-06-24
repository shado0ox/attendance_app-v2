import { pgTable, serial, text, doublePrecision, jsonb, timestamp } from 'drizzle-orm/pg-core';

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
  username: text('username').notNull().unique(),
  password: text('password').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// 3. Attendance logs
export const attendance = pgTable('attendance', {
  id: serial('id').primaryKey(),
  empId: text('emp_id').notNull(),
  empName: text('emp_name').notNull(),
  dept: text('dept').default(''),
  date: text('date').notNull(),
  
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
