import { pgTable, text, timestamp, jsonb, uuid, boolean, pgEnum, integer, smallint } from 'drizzle-orm/pg-core';

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
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const offers = pgTable('offers', {
  id: uuid('id').defaultRandom().primaryKey(),
  requestId: uuid('request_id').notNull().references(() => requests.id),
  interpreterId: uuid('interpreter_id').notNull().references(() => interpreters.id),
  status: text('status').notNull().default('pending'),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

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

export const clients = pgTable('clients', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull().default('Organization'),
  archived: boolean('archived').notNull().default(false),
  data: jsonb('data').$type<ClientData>().notNull().default({ contacts: [], locations: [] }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type SelectClient = typeof clients.$inferSelect;
export type InsertClient = typeof clients.$inferInsert;

export const interpreterProfiles = pgTable('interpreter_profiles', {
  id: text('id').primaryKey(),
  interpreterId: text('interpreter_id').notNull(),
  timeZone: text('time_zone').notNull().default('America/Los_Angeles'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type SelectInterpreterProfile = typeof interpreterProfiles.$inferSelect;
export type InsertInterpreterProfile = typeof interpreterProfiles.$inferInsert;

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
});

export type SelectAvailabilityShare = typeof availabilityShares.$inferSelect;
export type InsertAvailabilityShare = typeof availabilityShares.$inferInsert;

