/**
 * Drizzle schema for Hoops Master (Neon Postgres).
 *
 * Mirrors the SQL in the season-upgrade plan. Credit is always scoped to a group
 * via group_id. Event times are stored as absolute instants (timestamptz); the
 * group's IANA timezone is the source of truth for local rendering/input.
 */

import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  date,
  doublePrecision,
  numeric,
  uniqueIndex,
  index,
  pgView,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// =============================================================================
// USERS
// =============================================================================

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  pieceUrl: text('piece_url'), // optional profile picture ("piece"), Vercel Blob URL
  globalRole: text('global_role').notNull().default('user'), // 'admin' | 'user'
  // Invite-only access: a row exists only for invited/seeded users. `onboarded`
  // flips true once the user has chosen their username on first sign-in.
  onboarded: boolean('onboarded').notNull().default(false),
  invitedBy: uuid('invited_by'),
  invitedAt: timestamp('invited_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// =============================================================================
// GROUPS / CREWS
// =============================================================================

export const groups = pgTable('groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description').default(''),
  bannerUrl: text('banner_url'), // optional crew banner image (Vercel Blob URL)
  bannerOrientation: text('banner_orientation').default('landscape'), // 'landscape' | 'portrait'
  visibility: text('visibility').notNull().default('private'), // 'public' | 'private'
  status: text('status').notNull().default('active'), // 'active' | 'archived'
  inviteCode: text('invite_code').notNull().unique(),
  timezone: text('timezone').notNull().default('Europe/Prague'),
  defaultEventSpots: integer('default_event_spots').notNull().default(10),
  defaultSlotCost: numeric('default_slot_cost', { precision: 10, scale: 2 }).notNull().default('0'),
  roundRobinSlide: integer('round_robin_slide').notNull().default(1),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// =============================================================================
// GROUP MEMBERSHIPS
// =============================================================================

export const groupMembers = pgTable(
  'group_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    groupRole: text('group_role').notNull().default('member'), // 'admin' | 'member'
    status: text('status').notNull().default('active'), // 'active' | 'inactive' | 'banned'
    invitedBy: uuid('invited_by').references(() => users.id),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    groupUserUnique: uniqueIndex('group_members_group_user_unique').on(t.groupId, t.userId),
  })
);

// =============================================================================
// EVENTS
// =============================================================================

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    totalSpots: integer('total_spots').notNull(),
    slotCost: numeric('slot_cost', { precision: 10, scale: 2 }).notNull(),
    location: text('location').default(''),
    description: text('description').default(''),
    eventType: text('event_type').notNull().default('regular'), // 'regular' | 'tournament' | 'special'
    assignmentMode: text('assignment_mode').notNull().default('admin_assign'), // 'admin_assign' | 'player_signup' | 'round_robin'
    signupOpensAt: timestamp('signup_opens_at', { withTimezone: true }),
    roundRobinOffset: integer('round_robin_offset'),
    status: text('status').notNull().default('scheduled'), // 'scheduled' | 'cancelled' | 'completed'
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    groupStartIdx: index('idx_events_group_start').on(t.groupId, t.startsAt),
  })
);

// =============================================================================
// EVENT ATTENDEES (SPOT HOLDERS)
// =============================================================================

export const eventAttendees = pgTable(
  'event_attendees',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id),
    originalUserId: uuid('original_user_id').notNull().references(() => users.id),
    status: text('status').notNull().default('confirmed'), // 'confirmed' | 'offered'
    offeredAt: timestamp('offered_at', { withTimezone: true }),
    assignedBy: uuid('assigned_by').references(() => users.id),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
    // Rider (plus-one) spot: non-null means this row is a +1 spot.
    // The referenced row is the owner's primary spot in the same event.
    parentAttendeeId: uuid('parent_attendee_id').references((): AnyPgColumn => eventAttendees.id),
  },
  (t) => ({
    // Partial unique index: one primary spot per user per event.
    // Rider rows (parentAttendeeId IS NOT NULL) are exempt, allowing a second row.
    primarySpotUnique: uniqueIndex('event_attendees_primary_spot_unique')
      .on(t.eventId, t.userId)
      .where(sql`${t.parentAttendeeId} IS NULL`),
    eventIdx: index('idx_attendees_event').on(t.eventId),
    userIdx: index('idx_attendees_user').on(t.userId),
  })
);

// =============================================================================
// EVENT WAITLIST (FIFO by joined_at)
// =============================================================================

export const eventWaitlist = pgTable(
  'event_waitlist',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    // true = queuing for a Rider (+1) spot (user already holds a primary spot)
    forRider: boolean('for_rider').notNull().default(false),
  },
  (t) => ({
    // Allows one primary waitlist entry AND one rider waitlist entry per user per event.
    eventUserTypeUnique: uniqueIndex('event_waitlist_event_user_type_unique').on(t.eventId, t.userId, t.forRider),
    eventJoinedIdx: index('idx_waitlist_event_joined').on(t.eventId, t.joinedAt),
  })
);

// =============================================================================
// ROUND-ROBIN ROSTER (ordered by sort_key)
// =============================================================================

export const roundRobinRosters = pgTable(
  'round_robin_rosters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id),
    sortKey: doublePrecision('sort_key').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    groupUserUnique: uniqueIndex('rr_roster_group_user_unique').on(t.groupId, t.userId),
    groupSortIdx: index('idx_rr_roster_group').on(t.groupId, t.sortKey),
  })
);

// =============================================================================
// SPOT TRANSACTIONS (append-only ledger)
// =============================================================================

export const spotTransactions = pgTable(
  'spot_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id').notNull().references(() => events.id),
    attendeeId: uuid('attendee_id').references(() => eventAttendees.id),
    groupId: uuid('group_id').notNull().references(() => groups.id),
    // display/audit only; never used in balance math
    type: text('type').notNull(),
    fromUserId: uuid('from_user_id').references(() => users.id),
    toUserId: uuid('to_user_id').notNull().references(() => users.id),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    notes: text('notes').default(''),
  },
  (t) => ({
    groupIdx: index('idx_transactions_group').on(t.groupId),
    eventIdx: index('idx_transactions_event').on(t.eventId),
    toUserIdx: index('idx_transactions_user_to').on(t.toUserId),
    fromUserIdx: index('idx_transactions_user_from').on(t.fromUserId),
  })
);

// =============================================================================
// PAYMENTS (admin-recorded cash/transfers received from players)
// =============================================================================

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id').notNull().references(() => groups.id),
    userId: uuid('user_id').notNull().references(() => users.id),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
    recordedBy: uuid('recorded_by').notNull().references(() => users.id),
    description: text('description').default(''),
    paymentDate: date('payment_date').notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    groupUserIdx: index('idx_payments_group_user').on(t.groupId, t.userId),
  })
);

// =============================================================================
// IN-APP NOTIFICATIONS
// =============================================================================

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // 'spot_offered_claimed' | 'bench_promoted'
    title: text('title').notNull(),
    body: text('body').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userCreatedIdx: index('idx_notifications_user_created').on(t.userId, t.createdAt),
    unreadIdx: index('idx_notifications_user_unread')
      .on(t.userId)
      .where(sql`${t.readAt} IS NULL`),
  })
);

// =============================================================================
// CREDIT BALANCE VIEW
// =============================================================================
// balance = paid - received(to_user) + given-up(from_user). No type filtering:
// symmetric and self-balancing (see plan 3.7/3.8).

export const playerCreditBalances = pgView('player_credit_balances', {
  groupId: uuid('group_id').notNull(),
  userId: uuid('user_id').notNull(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
  totalPaid: numeric('total_paid', { precision: 10, scale: 2 }).notNull(),
  totalSpent: numeric('total_spent', { precision: 10, scale: 2 }).notNull(),
  totalEarned: numeric('total_earned', { precision: 10, scale: 2 }).notNull(),
  balance: numeric('balance', { precision: 10, scale: 2 }).notNull(),
}).as(sql`
  SELECT
    gm.group_id,
    gm.user_id,
    u.email,
    u.display_name,
    COALESCE(p.total_paid, 0)    AS total_paid,
    COALESCE(t_spent.total_spent, 0)  AS total_spent,
    COALESCE(t_earned.total_earned, 0) AS total_earned,
    COALESCE(p.total_paid, 0)
      - COALESCE(t_spent.total_spent, 0)
      + COALESCE(t_earned.total_earned, 0) AS balance
  FROM group_members gm
  JOIN users u ON u.id = gm.user_id
  LEFT JOIN (
    SELECT group_id, user_id, SUM(amount) AS total_paid
    FROM payments GROUP BY group_id, user_id
  ) p ON p.group_id = gm.group_id AND p.user_id = gm.user_id
  LEFT JOIN (
    SELECT group_id, to_user_id AS user_id, SUM(amount) AS total_spent
    FROM spot_transactions
    GROUP BY group_id, to_user_id
  ) t_spent ON t_spent.group_id = gm.group_id AND t_spent.user_id = gm.user_id
  LEFT JOIN (
    SELECT group_id, from_user_id AS user_id, SUM(amount) AS total_earned
    FROM spot_transactions
    WHERE from_user_id IS NOT NULL
    GROUP BY group_id, from_user_id
  ) t_earned ON t_earned.group_id = gm.group_id AND t_earned.user_id = gm.user_id
  WHERE gm.status = 'active'
`);
