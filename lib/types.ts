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
  globalRole: GlobalRole;  // Global role: 'admin' | 'user'
  createdAt: string;       // ISO timestamp
}

export type GlobalRole = 'admin' | 'user';

/**
 * Groups Sheet - Group/community definitions
 * Primary key: groupId (UUID)
 */
export interface Group {
  groupId: string;           // UUID primary key
  name: string;              // Group name
  description: string;       // Group description
  visibility: GroupVisibility;
  spreadsheetId: string;     // Google Sheets ID for group data
  defaultEventSpots: number; // Default spots per event
  createdBy: string;         // Email of creator
  createdAt: string;         // ISO timestamp
  inviteCode: string;        // Unique invite code for private groups
  status: GroupStatus;
}

export type GroupVisibility = 'public' | 'private';
export type GroupStatus = 'active' | 'archived';

/**
 * GroupMembers Sheet - User-Group relationships
 * Composite key: groupId + userEmail
 */
export interface GroupMember {
  groupId: string;           // FK to Groups.groupId
  userEmail: string;         // FK to AppUsers.email
  groupRole: GroupRole;      // 'admin' | 'member'
  joinedAt: string;          // ISO timestamp
  invitedBy: string | null;  // Email of inviter (optional)
  status: MemberStatus;
}

export type GroupRole = 'admin' | 'member';
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
  date: string;              // YYYY-MM-DD format
  startTime: string;         // HH:MM format
  endTime: string;           // HH:MM format
  totalSpots: number;        // Maximum players
  slotCost: number;          // Cost per slot
  location: string;          // Venue name/address
  description: string;       // Event notes
  eventType: EventType;
  status: EventStatus;
  signupOpensAt: string;     // ISO timestamp when signup opens
  createdBy: string;         // Email of admin who created
  createdAt: string;         // ISO timestamp
}

export type EventType = 'regular' | 'tournament' | 'special';
export type EventStatus = 'scheduled' | 'cancelled' | 'completed';

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
  originalUserEmail: string;    // Email of originally assigned user
  status: AttendeeStatus;
  offeredAt: string | null;     // ISO timestamp when offered
  assignedBy: string | null;    // Email of admin who assigned
  assignedAt: string;           // ISO timestamp when assigned
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

export type TransactionType = 'claim' | 'offer' | 'retract' | 'reassign' | 'admin-reassign';

// =============================================================================
// API REQUEST/RESPONSE TYPES
// =============================================================================

/**
 * User profile response
 */
export interface UserProfile {
  email: string;
  displayName: string;
  globalRole: GlobalRole;
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
  assignedUsers?: string[];  // Emails of users to pre-assign
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

