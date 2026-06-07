/**
 * Hoops Master - Type Definitions
 * 
 * This file contains all TypeScript interfaces for the new database schema.
 * Email is used as the unique identifier for users throughout the system.
 */

// =============================================================================
// MASTER SPREADSHEET TYPES
// =============================================================================

/**
 * AppUsers Sheet - Registered users
 * Primary key: email
 */
export interface AppUser {
  email: string;           // Primary key (Google login email)
  displayName: string;     // User's display name
  pieceUrl?: string;       // Optional profile picture ("piece") URL
  globalRole: GlobalRole;  // Global role: 'admin' | 'user'
  onboarded: boolean;      // Has the user chosen their username on first sign-in
  createdAt: string;       // ISO timestamp
}

// App-level roles. 'owner' is functionally an admin but cannot be demoted by
// other admins (only the owner role is protected).
export type GlobalRole = 'owner' | 'admin' | 'user';

/**
 * Groups Sheet - Group/community definitions
 * Primary key: groupId (UUID)
 */
export interface Group {
  groupId: string;           // UUID primary key
  name: string;              // Group name
  description: string;       // Group description
  bannerUrl?: string;        // Optional crew banner image URL
  bannerOrientation?: BannerOrientation; // Layout hint for the banner image
  visibility: GroupVisibility;
  spreadsheetId?: string;    // Legacy (Google Sheets) — optional, no longer used
  timezone: string;          // IANA timezone for event date/time logic
  defaultEventSpots: number; // Default spots per event
  defaultSlotCost: number;   // Default cost per spot
  roundRobinSlide: number;   // Positions to shift per event in round-robin mode
  createdBy: string;         // Email of creator
  createdAt: string;         // ISO timestamp
  inviteCode: string;        // Unique invite code for private groups
  status: GroupStatus;
  memberCount?: number;      // Active members (populated in list views)
  eventCount?: number;       // Scheduled games (populated in list views)
}

export type GroupVisibility = 'public' | 'private';
export type GroupStatus = 'active' | 'archived';
export type BannerOrientation = 'landscape' | 'portrait';

/**
 * GroupMembers Sheet - User-Group relationships
 * Composite key: groupId + userEmail
 */
export interface GroupMember {
  groupId: string;           // FK to Groups.groupId
  userEmail: string;         // FK to AppUsers.email
  displayName: string;       // User's chosen username
  pieceUrl?: string;         // Optional profile picture ("piece") URL
  groupRole: GroupRole;      // 'admin' (capo) | 'coleader' (king) | 'member'
  joinedAt: string;          // ISO timestamp
  invitedBy: string | null;  // Email of inviter (optional)
  status: MemberStatus;
}

// Crew-level roles (graffiti-themed):
//   'admin'    -> Crew Capo (crew leader; full control)
//   'coleader' -> King (elevated; manage events + add members)
//   'member'   -> Crew (regular member)
export type GroupRole = 'admin' | 'coleader' | 'member';
export type MemberStatus = 'active' | 'inactive' | 'banned';

// =============================================================================
// PER-GROUP SPREADSHEET TYPES
// =============================================================================

/**
 * Events Sheet - Events/sessions within a group
 * Primary key: eventId (UUID)
 */
export interface Event {
  eventId: string;           // UUID primary key
  groupId?: string;          // FK to Groups.groupId
  date: string;              // YYYY-MM-DD (in group timezone)
  startTime: string;         // HH:MM (in group timezone)
  endTime: string;           // HH:MM (in group timezone)
  startsAt: string;          // ISO timestamp (absolute, authoritative)
  endsAt: string;            // ISO timestamp (absolute, authoritative)
  totalSpots: number;        // Maximum players
  slotCost: number;          // Cost per slot
  location: string;          // Venue name/address
  description: string;       // Event notes
  eventType: EventType;
  assignmentMode: AssignmentMode;
  roundRobinOffset?: number | null;
  status: EventStatus;
  signupOpensAt: string;     // ISO timestamp when signup opens
  createdBy: string;         // Email of admin who created
  createdAt: string;         // ISO timestamp
}

export type EventType = 'regular' | 'tournament' | 'special';
export type EventStatus = 'scheduled' | 'cancelled' | 'completed';
export type AssignmentMode = 'admin_assign' | 'player_signup' | 'round_robin';

/**
 * Signup open timing options for event creation
 */
export type SignupOpenType = 'immediate' | 'relative' | 'absolute';

/**
 * EventAttendees Sheet - Who's attending each event
 * Primary key: attendeeId (UUID)
 */
export interface EventAttendee {
  attendeeId: string;           // UUID primary key
  eventId: string;              // FK to Events.eventId
  userEmail: string;            // FK to AppUsers.email (current holder)
  userName: string;             // Display name of current holder
  originalUserEmail: string;    // Email of originally assigned user
  status: AttendeeStatus;
  offeredAt: string | null;     // ISO timestamp when offered
  assignedBy: string | null;    // Email of admin who assigned
  assignedAt: string;           // ISO timestamp when assigned
  parentAttendeeId: string | null; // null = primary spot; non-null = Rider row (FK to owner's primary)
  isPlusOne: boolean;              // convenience: parentAttendeeId !== null
}

export type AttendeeStatus = 'confirmed' | 'offered';

/**
 * Transactions Sheet - Slot transaction history
 * Primary key: transactionId (UUID)
 */
export interface Transaction {
  transactionId: string;        // UUID primary key
  eventId: string;              // FK to Events.eventId
  attendeeId: string;           // FK to EventAttendees.attendeeId
  type: TransactionType;
  fromUserEmail: string | null; // Email of user giving up spot (null if free)
  toUserEmail: string;          // Email of user receiving spot
  amount: number;               // Slot cost at time of transaction
  timestamp: string;            // ISO timestamp
  settledAt: string | null;     // ISO timestamp when settled (null = unsettled)
  notes: string;                // Additional notes
}

export type TransactionType =
  | 'admin_assign'
  | 'round_robin_assign'
  | 'signup'
  | 'offer'
  | 'claim'
  | 'retract'
  | 'reassign'
  | 'admin_reassign'
  | 'release'
  | 'waitlist_promote';

// =============================================================================
// WAITLIST / ROSTER / CREDIT TYPES
// =============================================================================

export interface WaitlistEntry {
  userEmail: string;
  displayName: string;
  position: number;          // computed FIFO position (1-based, across all entries)
  joinedAt: string;          // ISO timestamp
  forRider: boolean;         // true = queuing for a Rider (+1) spot
}

export interface RosterEntry {
  userEmail: string;
  displayName: string;
  sortKey: number;
  isActive: boolean;
}

export interface CreditBalance {
  userEmail: string;
  displayName: string;
  totalPaid: number;
  totalSpent: number;        // spots received (cost)
  totalEarned: number;       // spots given up (credit returned)
  balance: number;           // paid - spent + earned
}

export interface PaymentRecord {
  paymentId: string;
  userEmail: string;
  amount: number;
  recordedBy: string;
  description: string;
  paymentDate: string;       // YYYY-MM-DD
  createdAt: string;
}

export interface CreditTransaction {
  transactionId: string;
  eventId: string;
  type: TransactionType;
  fromUserEmail: string | null;
  toUserEmail: string;
  amount: number;
  createdAt: string;
  notes: string;
}

// =============================================================================
// API REQUEST/RESPONSE TYPES
// =============================================================================

/**
 * User profile response
 */
export interface UserProfile {
  email: string;
  displayName: string;
  pieceUrl?: string;
  globalRole: GlobalRole;
  onboarded: boolean;
  createdAt: string;
  groups: GroupMembership[];
}

/**
 * User's group membership info
 */
export interface GroupMembership {
  groupId: string;
  groupName: string;
  groupRole: GroupRole;
  status: MemberStatus;
}

/**
 * Create group request
 */
export interface CreateGroupRequest {
  name: string;
  description: string;
  visibility: GroupVisibility;
  defaultEventSpots: number;
}

/**
 * Create event request
 */
export interface CreateEventRequest {
  date: string;              // YYYY-MM-DD
  startTime: string;         // HH:MM
  endTime: string;           // HH:MM
  totalSpots: number;
  slotCost: number;
  location?: string;
  description?: string;
  eventType?: EventType;
  assignmentMode?: AssignmentMode;
  assignedUsers?: string[];  // Emails of users to pre-assign (admin_assign)
}

/**
 * Bulk create events request (recurring)
 */
export interface BulkCreateEventsRequest {
  startDate: string;         // YYYY-MM-DD
  endDate: string;           // YYYY-MM-DD
  dayOfWeek: number;         // 0-6 (Sunday-Saturday)
  startTime: string;         // HH:MM
  endTime: string;           // HH:MM
  totalSpots: number;
  slotCost: number;
  location?: string;
  description?: string;
  eventType?: EventType;
}

/**
 * Event with attendees (for display)
 */
export interface EventWithAttendees extends Event {
  attendees: EventAttendee[];
  waitlist: WaitlistEntry[];
  availableSpots: number;
  offeredSpots: number;
}

/**
 * Settlement overview for a user
 */
export interface UserSettlement {
  userEmail: string;
  displayName: string;
  balance: number;           // Positive = owed money, Negative = owes money
  slotsGivenAway: number;
  slotsClaimed: number;
  unsettledTransactions: number;
}

/**
 * Simplified debt between two users
 */
export interface SimplifiedDebt {
  fromUserEmail: string;
  toUserEmail: string;
  amount: number;
}

// =============================================================================
// SHEET ROW TYPES (for parsing Google Sheets data)
// =============================================================================

/**
 * Raw row data from AppUsers sheet
 * Columns: email, displayName, role, createdAt
 */
export type AppUserRow = [string, string, string, string];

/**
 * Raw row data from Groups sheet
 * Columns: groupId, name, description, visibility, spreadsheetId, defaultEventSpots, createdBy, createdAt, inviteCode, status
 */
export type GroupRow = [string, string, string, string, string, string, string, string, string, string];

/**
 * Raw row data from GroupMembers sheet
 * Columns: groupId, userEmail, role, joinedAt, invitedBy, status
 */
export type GroupMemberRow = [string, string, string, string, string, string];

/**
 * Raw row data from Events sheet
 * Columns: eventId, date, startTime, endTime, totalSpots, slotCost, location, description, eventType, status, createdBy, createdAt
 */
export type EventRow = [string, string, string, string, string, string, string, string, string, string, string, string, string];

/**
 * Raw row data from EventAttendees sheet
 * Columns: attendeeId, eventId, userEmail, originalUserEmail, status, offeredAt, assignedBy, assignedAt
 */
export type EventAttendeeRow = [string, string, string, string, string, string, string, string];

/**
 * Raw row data from Transactions sheet
 * Columns: transactionId, eventId, attendeeId, type, fromUserEmail, toUserEmail, amount, timestamp, settledAt, notes
 */
export type TransactionRow = [string, string, string, string, string, string, string, string, string, string];

// =============================================================================
// HELPER TYPES
// =============================================================================

/**
 * Sheet column headers for master spreadsheet
 */
export const MASTER_SHEET_HEADERS: {
  AppUsers: string[];
  Groups: string[];
  GroupMembers: string[];
} = {
  AppUsers: ['email', 'displayName', 'globalRole', 'createdAt'],
  Groups: ['groupId', 'name', 'description', 'visibility', 'spreadsheetId', 'defaultEventSpots', 'createdBy', 'createdAt', 'inviteCode', 'status'],
  GroupMembers: ['groupId', 'userEmail', 'groupRole', 'joinedAt', 'invitedBy', 'status'],
};

/**
 * Sheet column headers for group spreadsheet
 */
export const GROUP_SHEET_HEADERS: {
  Events: string[];
  EventAttendees: string[];
  Transactions: string[];
} = {
  Events: ['eventId', 'date', 'startTime', 'endTime', 'totalSpots', 'slotCost', 'location', 'description', 'eventType', 'status', 'signupOpensAt', 'createdBy', 'createdAt'],
  EventAttendees: ['attendeeId', 'eventId', 'userEmail', 'originalUserEmail', 'status', 'offeredAt', 'assignedBy', 'assignedAt'],
  Transactions: ['transactionId', 'eventId', 'attendeeId', 'type', 'fromUserEmail', 'toUserEmail', 'amount', 'timestamp', 'settledAt', 'notes'],
};

