import { pgTable, text, timestamp, jsonb, uuid, boolean, pgEnum } from 'drizzle-orm/pg-core';

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
