import { pgTable, text, timestamp, jsonb, uuid, boolean, pgEnum, integer, smallint, numeric, uniqueIndex, varchar, index, date } from 'drizzle-orm/pg-core';

export type HearingIdentity = 'deaf' | 'hard of hearing' | 'deafblind' | 'late_deafened' | 'other';
export type Program = 'General' | 'WA ODHH' | 'WA Apple Health';

export interface RequestData {
  brief: {
    hearingIdentity?: HearingIdentity;
  };
  intake: {
    program?: Program;
    odhhSrn?: string;
    odhhAccessCode?: string;
    providerOneNumber?: string;
  };
  [key: string]: any;
}

export const billingStatusEnum = pgEnum('billing_status', ['completed', 'cancelled_billable', 'cancelled_not_billable']);

export const requests = pgTable('requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  status: text('status').notNull().default('draft'),
  data: jsonb('data').$type<RequestData>().notNull().default({ brief: {}, intake: {} }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  canceledAt: timestamp('canceled_at'),
  cancelReason: text('cancel_reason'),
  clientRequestedCancellation: boolean('client_requested_cancellation').notNull().default(false),
  // State job (ODHH/HCA): hours are submitted in the state portal, so no TerpDesk timesheet emails.
  isStateJob: boolean('is_state_job').notNull().default(false),
  travelStartTime: timestamp('travel_start_time'),
  travelEndTime: timestamp('travel_end_time'),
  serviceCompleted: boolean('service_completed'),
  cancellationReason: text('cancellation_reason'),
  billingStatus: billingStatusEnum('billing_status'),
});

export type SelectRequest = typeof requests.$inferSelect;
export type InsertRequest = typeof requests.$inferInsert;

export const interpreters = pgTable('interpreters', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  phone: text('phone'),
  // The login that owns this profile. NULL = shadow/external profile created by an agency, not yet claimed.
  // (Lazy reference: `users` is declared below.)
  userId: uuid('user_id').unique().references(() => users.id),
  // LEGACY: no longer written or read. Roster membership lives in agency_interpreters.
  rosterAgencyId: text('roster_agency_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const userRoleValues = ['agency', 'interpreter'] as const;
export type UserRole = (typeof userRoleValues)[number];

// Legacy per-account status. Approval now happens per agency connection (see agencyInterpreters).
export const accountStatusValues = ['pending', 'approved', 'rejected'] as const;
export type AccountStatus = (typeof accountStatusValues)[number];

// Login accounts (NextAuth credentials). Passwords are stored only as bcrypt hashes.
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  role: varchar('role', { length: 20, enum: userRoleValues }).notNull(),
  // No longer a login gate: anyone may register and sign in. Kept so existing rows stay valid; always 'approved'.
  accountStatus: varchar('account_status', { length: 20, enum: accountStatusValues }).notNull().default('approved'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Security audit trail (logins, approvals, ...). `details` must never contain PHI.
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: varchar('user_id', { length: 255 }),
  userEmail: varchar('user_email', { length: 255 }),
  action: varchar('action', { length: 100 }).notNull(),
  details: text('details'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  // Serves the brute-force check: failed logins for one email within a time window.
  actionEmailCreatedIdx: index('audit_logs_action_email_created_idx').on(t.action, t.userEmail, t.createdAt),
}));

export type SelectAuditLog = typeof auditLogs.$inferSelect;

// In-app notifications (bell icon). `message` must never contain PHI: no client names or appointment details.
export const notificationTypeValues = ['system', 'job', 'agency'] as const;
export type NotificationType = (typeof notificationTypeValues)[number];

export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  // The login that receives it.
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 200 }).notNull(),
  message: text('message').notNull(),
  type: varchar('type', { length: 20, enum: notificationTypeValues }).notNull().default('system'),
  // Optional in-app path to open when the notification is clicked.
  href: varchar('href', { length: 300 }),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  userReadCreatedIdx: index('notifications_user_read_created_idx').on(t.userId, t.isRead, t.createdAt),
}));

export const activityAudienceValues = ['agency', 'shared'] as const;
export type ActivityAudience = (typeof activityAudienceValues)[number];

/** One field change in an activity entry, e.g. { field: "Time", from: "9:00 AM", to: "10:00 AM" }. */
export interface ActivityChange {
  field: string;
  from: string;
  to: string;
}

/**
 * Timestamped history of a request ("Request created", "Time changed from X to Y").
 * 'agency' entries are staff-only. 'shared' entries are also shown to booked interpreters on their secure job page;
 * when `interpreterId` is set, a shared entry is shown only to that interpreter (e.g. their own booking).
 */
export const requestActivity = pgTable('request_activity', {
  id: uuid('id').defaultRandom().primaryKey(),
  requestId: uuid('request_id').notNull().references(() => requests.id, { onDelete: 'cascade' }),
  interpreterId: uuid('interpreter_id').references(() => interpreters.id, { onDelete: 'set null' }),
  audience: varchar('audience', { length: 10, enum: activityAudienceValues }).notNull().default('agency'),
  kind: varchar('kind', { length: 40 }).notNull(),
  message: text('message').notNull(),
  changes: jsonb('changes').$type<ActivityChange[]>(),
  actorLabel: varchar('actor_label', { length: 120 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  requestCreatedIdx: index('request_activity_request_created_idx').on(t.requestId, t.createdAt),
}));

export type SelectNotification = typeof notifications.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

// Which agencies an interpreter belongs to. One row per (agency, interpreter profile).
//  - 'approved': on the agency's roster (e.g. the agency added them as a shadow profile, or approved a request)
//  - 'pending' : the interpreter asked to join with a join code and the agency has not decided yet
export const connectionStatusValues = ['pending', 'approved', 'rejected', 'revoked'] as const;
export type ConnectionStatus = (typeof connectionStatusValues)[number];

// May the agency feature this interpreter's public profile on its website? The interpreter opts in ('pending'),
// the agency approves ('approved'). Unchecking, declining or removing returns it to 'not_shared'.
export const websitePermissionValues = ['not_shared', 'pending', 'approved'] as const;
export type WebsitePermissionStatus = (typeof websitePermissionValues)[number];

export const agencyInterpreters = pgTable('agency_interpreters', {
  id: uuid('id').defaultRandom().primaryKey(),
  agencyId: text('agency_id').notNull(),
  interpreterId: uuid('interpreter_id').notNull().references(() => interpreters.id),
  // The login that owns the profile. NULL while it is still a shadow profile nobody has claimed.
  userId: uuid('user_id').references(() => users.id),
  status: varchar('status', { length: 20, enum: connectionStatusValues }).notNull().default('pending'),
  // Roster toggle for approved rows: false = archived/deactivated (no dispatches; history and connection kept).
  isActive: boolean('is_active').notNull().default(true),
  // Also added at runtime by ensureAgencyInterpreterColumns (src/lib/agencyInterpreterColumns.ts).
  websitePermissionStatus: varchar('website_permission_status', { length: 20, enum: websitePermissionValues })
    .notNull()
    .default('not_shared'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  agencyInterpreterIdx: uniqueIndex('agency_interpreters_agency_interpreter_idx').on(t.agencyId, t.interpreterId),
}));

export type SelectAgencyInterpreter = typeof agencyInterpreters.$inferSelect;

// One-time proof-of-email tokens (profile claiming). `token` holds the SHA-256 hash, never the raw value.
export const verificationTokens = pgTable('verification_tokens', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull().unique(),
  expires: timestamp('expires').notNull(),
});

export type SelectUser = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export type SelectInterpreter = typeof interpreters.$inferSelect;
export type InsertInterpreter = typeof interpreters.$inferInsert;


export const offers = pgTable('offers', {
  id: uuid('id').defaultRandom().primaryKey(),
  requestId: uuid('request_id').notNull().references(() => requests.id),
  interpreterId: uuid('interpreter_id').notNull().references(() => interpreters.id),
  status: text('status').notNull().default('pending'),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const timesheetStatusValues = ['pending', 'submitted', 'approved', 'rejected'] as const;
export type TimesheetStatus = (typeof timesheetStatusValues)[number];

export interface TimesheetTravelLeg {
  fromLabel: string;
  toLabel: string;
  miles: number;
  roundTrip: boolean;
}

export const timesheets = pgTable('timesheets', {
  id: uuid('id').defaultRandom().primaryKey(),
  requestId: uuid('request_id').notNull().references(() => requests.id),
  interpreterId: uuid('interpreter_id').notNull().references(() => interpreters.id),
  // SHA-256 hex digest of the magic-link token. The raw token is never stored.
  tokenHash: text('token_hash').notNull(),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }).notNull(),
  actualStartTime: timestamp('actual_start_time', { withTimezone: true }),
  actualEndTime: timestamp('actual_end_time', { withTimezone: true }),
  breakMinutes: integer('break_minutes'),
  travelStartTime: timestamp('travel_start_time', { withTimezone: true }),
  travelEndTime: timestamp('travel_end_time', { withTimezone: true }),
  billableHours: numeric('billable_hours', { precision: 5, scale: 2 }),
  mileage: numeric('mileage', { precision: 7, scale: 1 }),
  // Agency-approved mileage; kept separate so the interpreter's submitted value is never overwritten.
  approvedMileage: numeric('approved_mileage', { precision: 7, scale: 1 }),
  notes: text('notes'),
  mileageNote: text('mileage_note'),
  // Itemised mileage legs as entered by the interpreter; `mileage` holds the server-computed total.
  travelLegs: jsonb('travel_legs').$type<TimesheetTravelLeg[]>(),
  // ODHH only: whether the service was completed (the "verification" question).
  serviceCompleted: boolean('service_completed'),
  cancellationReason: text('cancellation_reason'),
  serviceNote: text('service_note'),
  signatureDataUrl: text('signature_data_url'),
  status: text('status', { enum: timesheetStatusValues }).notNull().default('pending'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  tokenHashIdx: uniqueIndex('timesheets_token_hash_idx').on(t.tokenHash),
}));

export type SelectTimesheet = typeof timesheets.$inferSelect;
export type InsertTimesheet = typeof timesheets.$inferInsert;

export interface ClientContact {
  id: string;
  type: 'Requester contact' | 'Billing contact';
  name: string;
  role?: string;
  email: string;
  phone: string;
  isDefault: boolean;
  isArchived?: boolean;
}

export interface ClientLocation {
  id: string;
  name: string;
  streetAddress?: string;
  address?: string;
  roomOrSuite?: string;
  room?: string;
  parking?: string;
  entrance?: string;
  checkInInstructions?: string;
  instructions?: string;
  isDefault: boolean;
  isArchived?: boolean;
}

export interface ClientAuditLog {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  details: string;
}

export interface ClientData {
  generalEmail?: string;
  generalPhone?: string;
  billingOrganization?: string;
  billingOrg?: string;
  billingAddress?: string;
  privateNotes?: string;
  contacts: ClientContact[];
  locations: ClientLocation[];
  auditLogs?: ClientAuditLog[];
  [key: string]: any;
}

export const clientTypeValues = ['organization', 'individual', 'state_agency', 'private_hospital'] as const;
export type ClientType = (typeof clientTypeValues)[number];

export const clients = pgTable('clients', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type', { enum: clientTypeValues }).notNull().default('organization'),
  archived: boolean('archived').notNull().default(false),
  data: jsonb('data').$type<ClientData>().notNull().default({ contacts: [], locations: [] }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type SelectClient = typeof clients.$inferSelect;
export type InsertClient = typeof clients.$inferInsert;

export const contactVisibilityValues = ['private', 'shared'] as const;
export type ContactVisibility = (typeof contactVisibilityValues)[number];

// One row per interpreter (the calendar's time zone plus the "My Profile" fields the interpreter edits).
// Keep in sync with the runtime DDL in ensureAvailabilityTables (src/app/actions/availability.ts).
export const interpreterProfiles = pgTable('interpreter_profiles', {
  id: text('id').primaryKey(),
  interpreterId: text('interpreter_id').notNull(),
  timeZone: text('time_zone').notNull().default('America/Los_Angeles'),
  preferredName: varchar('preferred_name', { length: 80 }),
  photoUrl: varchar('photo_url', { length: 500 }),
  shortBio: text('short_bio'),
  city: varchar('city', { length: 100 }),
  stateOrRegion: varchar('state_or_region', { length: 100 }),
  serviceArea: varchar('service_area', { length: 200 }),
  takesInPerson: boolean('takes_in_person').notNull().default(true),
  takesVirtual: boolean('takes_virtual').notNull().default(true),
  workEmail: varchar('work_email', { length: 255 }),
  workPhone: varchar('work_phone', { length: 30 }),
  // Who may see the work email/phone: 'private' = only the interpreter, 'shared' = agencies they are connected to.
  contactVisibility: varchar('contact_visibility', { length: 10, enum: contactVisibilityValues }).notNull().default('private'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type SelectInterpreterProfile = typeof interpreterProfiles.$inferSelect;
export type InsertInterpreterProfile = typeof interpreterProfiles.$inferInsert;

// Certifications, insurance, training... an interpreter lists on their profile. Dates are plain calendar dates.
// Keep in sync with the runtime DDL in ensureAvailabilityTables (src/app/actions/availability.ts).
export const credentialTypeValues = ['Certification', 'Qualification', 'Training', 'Insurance', 'Other'] as const;
export type CredentialType = (typeof credentialTypeValues)[number];

export const credentials = pgTable('credentials', {
  id: uuid('id').defaultRandom().primaryKey(),
  interpreterId: uuid('interpreter_id').notNull().references(() => interpreters.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 150 }).notNull(),
  type: varchar('type', { length: 20, enum: credentialTypeValues }).notNull(),
  issuedBy: varchar('issued_by', { length: 150 }),
  credentialNumber: varchar('credential_number', { length: 100 }),
  issueDate: date('issue_date', { mode: 'string' }),
  expirationDate: date('expiration_date', { mode: 'string' }),
  notes: text('notes'),
  // Soft delete: archived credentials are hidden from the profile and from agencies, but kept.
  isArchived: boolean('is_archived').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  interpreterIdx: index('credentials_interpreter_idx').on(t.interpreterId),
}));

export type SelectCredential = typeof credentials.$inferSelect;
export type InsertCredential = typeof credentials.$inferInsert;

// Which agency may see which credential. A row exists only while it is shared; `include_files` adds its files.
export const credentialAgencyShares = pgTable('credential_agency_shares', {
  id: uuid('id').defaultRandom().primaryKey(),
  credentialId: uuid('credential_id').notNull().references(() => credentials.id, { onDelete: 'cascade' }),
  agencyId: text('agency_id').notNull(),
  includeFiles: boolean('include_files').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  credentialAgencyIdx: uniqueIndex('credential_agency_shares_credential_agency_idx').on(t.credentialId, t.agencyId),
}));

// Files in S3 (prep materials now; profile photos and credential documents later). The bucket is PRIVATE:
// `file_url` is the object's address for reference only, and every view goes through a short-lived signed link
// issued after an authorization check. `storage_key` is the S3 object key used for signing.
// Keep in sync with the runtime DDL in ensureAvailabilityTables (src/app/actions/availability.ts).
export const files = pgTable('files', {
  id: uuid('id').defaultRandom().primaryKey(),
  fileUrl: text('file_url').notNull(),
  storageKey: text('storage_key').notNull().unique(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  contentType: varchar('content_type', { length: 100 }).notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  uploadedByAgencyId: text('uploaded_by_agency_id'),
  uploadedByInterpreterId: uuid('uploaded_by_interpreter_id').references(() => interpreters.id, { onDelete: 'set null' }),
  linkedJobId: uuid('linked_job_id').references(() => requests.id, { onDelete: 'cascade' }),
  linkedCredentialId: uuid('linked_credential_id').references(() => credentials.id, { onDelete: 'cascade' }),
  // Prep materials: false = agency only; true = interpreters booked on the linked job can open it.
  sharedWithInterpreters: boolean('shared_with_interpreters').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  linkedJobIdx: index('files_linked_job_idx').on(t.linkedJobId),
}));

export type SelectFile = typeof files.$inferSelect;

export const availabilityRules = pgTable('availability_rules', {
  id: text('id').primaryKey(),
  interpreterId: text('interpreter_id').notNull(),
  weekday: smallint('weekday').notNull(),
  startMinute: integer('start_minute').notNull(),
  endMinute: integer('end_minute').notNull(),
});

export type SelectAvailabilityRule = typeof availabilityRules.$inferSelect;
export type InsertAvailabilityRule = typeof availabilityRules.$inferInsert;

export const availabilityExceptions = pgTable('availability_exceptions', {
  id: text('id').primaryKey(),
  interpreterId: text('interpreter_id').notNull(),
  onDate: text('on_date').notNull(),
  available: boolean('available').notNull().default(false),
  startMinute: integer('start_minute'),
  endMinute: integer('end_minute'),
});

export type SelectAvailabilityException = typeof availabilityExceptions.$inferSelect;
export type InsertAvailabilityException = typeof availabilityExceptions.$inferInsert;

export const busyBlocks = pgTable('busy_blocks', {
  id: text('id').primaryKey(),
  interpreterId: text('interpreter_id').notNull(),
  title: text('title'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  timeZone: text('time_zone'),
  revision: integer('revision').notNull().default(1),
});

export type SelectBusyBlock = typeof busyBlocks.$inferSelect;
export type InsertBusyBlock = typeof busyBlocks.$inferInsert;

export const availabilityShares = pgTable('availability_shares', {
  id: text('id').primaryKey(),
  agencyId: text('agency_id').notNull(),
  interpreterId: text('interpreter_id').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  // Separate permission: this agency may book the interpreter without an offer. Only valid while `enabled`.
  allowsAutoBook: boolean('allows_auto_book').notNull().default(false),
});

export type SelectAvailabilityShare = typeof availabilityShares.$inferSelect;
export type InsertAvailabilityShare = typeof availabilityShares.$inferInsert;

