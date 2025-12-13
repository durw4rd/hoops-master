# Hoops Master - Refactoring Plan

## Executive Summary

This document outlines the plan to transform the single-group "Summer Hoops Scheduler" into a multi-tenant "Hoops Master" platform where organizers can create groups, manage events, and players can join groups, claim spots, and settle transactions.

---

## Current State Analysis

### Current Architecture
- **Single Google Spreadsheet** with hardcoded sheets:
  - `Daily schedule` - Event schedule with player lists
  - `Marketplace` - Slot trading/transaction records
  - `User mapping` - Player registration data
  - `Settlement Batches` / `Settlement Pairings` / `Settlement Transactions` - Financial tracking
  - `Tournament` - Special tournament data

### Current Limitations
1. **Single Group**: No concept of multiple groups/communities
2. **Hardcoded Structure**: Sheet names and ranges are hardcoded
3. **Flat Relationships**: Player-event relationships stored as comma-separated strings in cells
4. **No Multi-tenancy**: Cannot support multiple organizers or sports types
5. **Limited Scalability**: Adding new groups requires manual sheet creation
6. **Complex Queries**: Calculating settlements requires parsing multiple sheets

---

## Proposed Architecture

### Core Entities

```
┌─────────────────┐
│    AppUsers     │ ← Registered application users (Master)
└────────┬────────┘
         │
         │ N:M (via GroupMembers in Master)
         ▼
┌─────────────────┐
│     Groups      │ ← Group metadata + spreadsheetId (Master)
└────────┬────────┘
         │
         │ 1:1 (each group has its own spreadsheet)
         ▼
┌─────────────────────────────────────┐
│     Group Spreadsheet               │
│  ├── Events                         │
│  ├── EventAttendees                 │
│  └── Transactions                   │
└─────────────────────────────────────┘
```

---

## Proposed Google Sheets Database Schema

### Hybrid Architecture

We use a **hybrid approach** with a master spreadsheet for global data and per-group spreadsheets for group-specific data:

**Master Spreadsheet** (single, shared):
```
[Hoops Master - Master]
├── AppUsers                 # Global user registry
├── Groups                   # Group metadata + spreadsheetId references
└── GroupMembers             # User-Group relationships
```

**Per-Group Spreadsheet** (created when group is created):
```
[Hoops Master - {GroupName}]
├── Events                   # Events for this group
├── EventAttendees           # Attendees for this group's events
└── Transactions             # Slot transactions for this group
```

### Benefits of Hybrid Approach
- ✅ Centralized user management (no duplicate users)
- ✅ Data isolation per group (privacy, performance)
- ✅ Easy group deletion (just delete spreadsheet)
- ✅ Better Google Sheets performance (smaller sheets)
- ✅ Can share individual group sheets with group admins
- ✅ Natural scalability as groups grow

### Sheet Schemas

---

## MASTER SPREADSHEET SHEETS

#### 1. `AppUsers` Sheet (Master)
Stores all registered users across the application. Email is the unique identifier.

| Column | Name | Type | Description | Example |
|--------|------|------|-------------|---------|
| A | `email` | String | Primary key (Google login email) | `john@example.com` |
| B | `displayName` | String | User's display name | `John Smith` |
| C | `globalRole` | Enum | `superadmin` / `user` | `user` |
| D | `createdAt` | ISO Date | Registration timestamp | `2025-01-15T10:30:00Z` |

**Indexes:** Email (primary key, unique)
**Notes:** Avatar derived from Google profile automatically. No UUID needed - email is unique identifier.

---

#### 2. `Groups` Sheet (Master)
Stores all groups/communities with reference to their individual spreadsheets.

| Column | Name | Type | Description | Example |
|--------|------|------|-------------|---------|
| A | `groupId` | UUID | Primary key | `group-001-uuid` |
| B | `name` | String | Group name | `Summer Hoops Amsterdam` |
| C | `description` | String | Group description | `Weekly basketball sessions` |
| D | `visibility` | Enum | `public` / `private` | `public` |
| E | `spreadsheetId` | String | Google Sheets ID for group data | `1BxiMVs0XRA5nF...` |
| F | `defaultEventSpots` | Number | Default spots per event | `10` |
| G | `createdBy` | String | Email of creator (FK to AppUsers) | `admin@example.com` |
| H | `createdAt` | ISO Date | Creation timestamp | `2025-01-15T10:30:00Z` |
| I | `inviteCode` | String | Unique invite code for private groups | `HOOPS2025` |
| J | `status` | Enum | `active` / `archived` | `active` |

**Indexes:** groupId, inviteCode (for lookups)
**Notes:** `spreadsheetId` references the per-group spreadsheet created when group is made.

---

#### 3. `GroupMembers` Sheet (Master)
Maps users to groups with their roles.

| Column | Name | Type | Description | Example |
|--------|------|------|-------------|---------|
| A | `groupId` | UUID | FK to Groups.groupId | `group-001-uuid` |
| B | `userEmail` | String | FK to AppUsers.email | `john@example.com` |
| C | `groupRole` | Enum | `admin` / `member` | `member` |
| D | `joinedAt` | ISO Date | When user joined | `2025-01-20T08:00:00Z` |
| E | `invitedBy` | String | Email of user who invited (optional) | `admin@example.com` |
| F | `status` | Enum | `active` / `inactive` / `banned` | `active` |

**Indexes:** groupId + userEmail (composite unique)
**Notes:** No membershipId needed - groupId + userEmail is unique.

---

## PER-GROUP SPREADSHEET SHEETS

Each group gets its own spreadsheet with the following sheets:

---

#### 4. `Events` Sheet (Per-Group)
Stores all events/sessions for this group. Each recurring event occurrence is a separate record.

| Column | Name | Type | Description | Example |
|--------|------|------|-------------|---------|
| A | `eventId` | UUID | Primary key | `event-001-uuid` |
| B | `date` | Date | Event date (YYYY-MM-DD) | `2025-12-20` |
| C | `startTime` | Time | Start time (HH:MM) | `19:00` |
| D | `endTime` | Time | End time (HH:MM) | `21:00` |
| E | `totalSpots` | Number | Maximum players | `10` |
| F | `slotCost` | Number | Cost per slot in currency | `7.60` |
| G | `location` | String | Venue name/address | `Sports Hall A` |
| H | `description` | String | Event notes | `Bring white shirt` |
| I | `eventType` | Enum | `regular` / `tournament` / `special` | `regular` |
| J | `status` | Enum | `scheduled` / `cancelled` / `completed` | `scheduled` |
| K | `createdBy` | String | Email of admin who created | `admin@example.com` |
| L | `createdAt` | ISO Date | Creation timestamp | `2025-12-01T10:00:00Z` |

**Indexes:** date (for queries), eventId
**Notes:** 
- No groupId column needed (implicit from spreadsheet)
- `slotCost` is the cost per slot for this specific event
- Recurring events: Admin uses bulk-create UI to generate multiple event records

---

#### 5. `EventAttendees` Sheet (Per-Group)
Tracks who is attending each event (each row = 1 attendee).

| Column | Name | Type | Description | Example |
|--------|------|------|-------------|---------|
| A | `attendeeId` | UUID | Primary key (spot identifier) | `att-001-uuid` |
| B | `eventId` | UUID | FK to Events.eventId | `event-001-uuid` |
| C | `userEmail` | String | FK to AppUsers.email (current holder) | `john@example.com` |
| D | `originalUserEmail` | String | Email of originally assigned user | `john@example.com` |
| E | `status` | Enum | `confirmed` / `offered` | `confirmed` |
| F | `offeredAt` | ISO Date | When spot was offered (null if not offered) | `null` |
| G | `assignedBy` | String | Email of admin who assigned (optional) | `admin@example.com` |
| H | `assignedAt` | ISO Date | When assigned | `2025-12-15T08:00:00Z` |

**Indexes:** eventId (for listing attendees), userEmail (for user's events)
**Notes:** 
- No swap functionality - removed `swapRequested` status
- When spot is claimed, `userEmail` is updated to the new holder
- `originalUserEmail` tracks who originally had the spot (for settlement)

---

#### 6. `Transactions` Sheet (Per-Group)
Records all slot transactions (claims, offers, reassignments). Source of truth for settlement calculations.

| Column | Name | Type | Description | Example |
|--------|------|------|-------------|---------|
| A | `transactionId` | UUID | Primary key | `txn-001-uuid` |
| B | `eventId` | UUID | FK to Events.eventId | `event-001-uuid` |
| C | `attendeeId` | UUID | FK to EventAttendees.attendeeId | `att-001-uuid` |
| D | `type` | Enum | `claim` / `offer` / `retract` / `reassign` / `admin-reassign` | `claim` |
| E | `fromUserEmail` | String | Email of user giving up spot (null if free spot) | `john@example.com` |
| F | `toUserEmail` | String | Email of user receiving spot | `jane@example.com` |
| G | `amount` | Number | Slot cost at time of transaction | `7.60` |
| H | `timestamp` | ISO Date | Transaction time | `2025-12-15T18:30:00Z` |
| I | `settledAt` | ISO Date | When financially settled (null = unsettled) | `null` |
| J | `notes` | String | Additional notes | `Admin reassignment` |

**Indexes:** eventId, fromUserEmail, toUserEmail
**Notes:** 
- No swap type - swaps deprecated
- Settlement calculations derived from Transactions where `settledAt` is null
- `amount` copied from Event.slotCost at transaction time

---

## Data Flow & Operations

### 1. User Registration Flow
```
1. User signs in with Google OAuth
2. Check if email exists in AppUsers (Master spreadsheet)
3. If not, create new AppUsers record (email, displayName, role='user')
4. Return user profile
```

### 2. Group Creation Flow (Admin)
```
1. Admin fills group creation form (name, visibility, settings)
2. Create new Google Spreadsheet for the group
3. Initialize sheets: Events, EventAttendees, Transactions
4. Create Groups record in Master with spreadsheetId
5. Create GroupMembers record (creator's email as admin)
6. Generate inviteCode for private groups
7. Return group details
```

### 3. User Joins Group Flow
```
Public Group:
1. User browses public groups (from Groups sheet)
2. User clicks "Join"
3. Create GroupMembers record in Master (userEmail, role: member)

Private Group:
1. User enters invite code
2. Validate code against Groups.inviteCode
3. Create GroupMembers record in Master (userEmail, role: member)

Admin Invite:
1. Admin enters user email or sends invite link
2. User authenticates
3. Create GroupMembers record with invitedBy email set
```

### 4. Event Creation Flow (Admin)
```
Single Event:
1. Admin selects group
2. Fills event form (date, time, spots, slotCost, location)
3. Create Events record in group's spreadsheet
4. Optionally pre-assign spots by email:
   - Admin enters user emails (or selects from group members)
   - Create EventAttendees records with userEmail set
   - Create Transactions records (type: admin-reassign)
5. Event appears in group's schedule

Bulk Creation (Recurring):
1. Admin selects "Create recurring events"
2. Specifies pattern (e.g., every Thursday for 8 weeks)
3. System generates individual Events records for each date
4. Each event is independent, can be individually edited/cancelled
```

### 5. Spot Claiming Flow
```
1. User views event with available spots
2. Clicks "Claim Spot"
3. Validate: user is group member, not already attending, spots available
4. Create EventAttendees record (userEmail = claimer)
5. Create Transactions record (type: claim, fromUserEmail: null, amount: event.slotCost)
6. Update UI to show new attendee
```

### 6. Spot Offering Flow
```
1. User has confirmed spot in event
2. Clicks "Offer for Grabs"
3. Update EventAttendees.status = 'offered'
4. Update EventAttendees.offeredAt = now
5. Create Transactions record (type: offer)
6. Spot appears in marketplace view
```

### 7. Spot Claiming (Offered Spot) Flow
```
1. User views marketplace with offered spots
2. Clicks "Claim" on an offered spot
3. Validate: user is group member, not already attending this event
4. Update EventAttendees.userEmail to claimer
5. Update EventAttendees.status = 'confirmed'
6. Create Transactions record (type: claim, fromUserEmail: original, toUserEmail: claimer)
7. Update UI
```

### 8. Admin Reassignment Flow
```
1. Admin selects an attendee in an event
2. Enters new user email (or selects from members)
3. Update EventAttendees.userEmail to new user
4. Create Transactions record (type: admin-reassign)
5. Original user no longer attending, new user attending
```

### 9. Settlement Overview (Read-Only)
```
1. Query Transactions where settledAt is null
2. Calculate net credits/debits per user based on amount field
3. Display overview: who owes whom
4. Users settle outside the app
5. Mark transactions as settled via settledAt timestamp
```

---

## Implementation Strategy

### Phase 1: Foundation (Master Spreadsheet + Core Lib)
1. Create Master spreadsheet with AppUsers, Groups, GroupMembers sheets
2. Build `lib/masterSheet.ts` for master spreadsheet operations
3. Build `lib/groupSheet.ts` for per-group spreadsheet operations
4. Implement user registration/lookup via Google OAuth
5. Basic API: `/api/user/profile`, `/api/user/register`

### Phase 2: Group Management
1. Implement group creation (creates new spreadsheet)
2. Implement Groups CRUD in master sheet
3. Implement GroupMembers management
4. Build admin UI: CreateGroupModal, GroupSettings
5. API: `/api/groups/*`, `/api/groups/[groupId]/members/*`

### Phase 3: Events
1. Implement Events CRUD in per-group spreadsheet
2. Build event creation UI (single + bulk recurring)
3. Build schedule view scoped to selected group
4. API: `/api/groups/[groupId]/events/*`

### Phase 4: Attendees & Spot Operations
1. Implement EventAttendees management
2. Implement claiming, offering, retracting
3. Implement Transactions recording
4. API: `/api/groups/[groupId]/events/[eventId]/*`

### Phase 5: Reassignments & Marketplace
1. Implement admin reassignment flow
2. Marketplace view per group (offered spots)
3. Claim offered spots flow

### Phase 6: Settlements (Simplified)
1. Implement settlement calculation from Transactions
2. Build read-only settlement overview
3. Implement "mark as settled" for transactions

---

## API Endpoints Plan

### Authentication & Users
```
GET  /api/auth/[...nextauth]  - NextAuth handlers (existing)
GET  /api/user/profile        - Get current user profile
POST /api/user/register       - Register/update user in AppUsers
```

### Groups
```
GET    /api/groups                - List user's groups (via GroupMembers)
POST   /api/groups                - Create group + spreadsheet (superadmin or allowed users)
GET    /api/groups/[groupId]      - Get group details
PATCH  /api/groups/[groupId]      - Update group settings (group admin)
DELETE /api/groups/[groupId]      - Archive group (group admin)
GET    /api/groups/public         - List public groups (for discovery)
POST   /api/groups/join           - Join group (public or via invite code)
```

### Group Members
```
GET    /api/groups/[groupId]/members          - List members
POST   /api/groups/[groupId]/members          - Add member (group admin invite)
PATCH  /api/groups/[groupId]/members/[userId] - Update member role/status
DELETE /api/groups/[groupId]/members/[userId] - Remove member (group admin)
```

### Events
```
GET    /api/groups/[groupId]/events           - List events (from group spreadsheet)
POST   /api/groups/[groupId]/events           - Create event(s) (group admin)
POST   /api/groups/[groupId]/events/bulk      - Bulk create recurring events
GET    /api/groups/[groupId]/events/[eventId] - Get event with attendees
PATCH  /api/groups/[groupId]/events/[eventId] - Update event (group admin)
DELETE /api/groups/[groupId]/events/[eventId] - Cancel event (group admin)
```

### Attendees & Spots
```
GET    /api/groups/[groupId]/events/[eventId]/attendees  - List attendees
POST   /api/groups/[groupId]/events/[eventId]/claim      - Claim available/offered spot
POST   /api/groups/[groupId]/events/[eventId]/offer      - Offer spot for grabs
POST   /api/groups/[groupId]/events/[eventId]/retract    - Retract offered spot
POST   /api/groups/[groupId]/events/[eventId]/reassign   - Reassign spot (admin)
```

### Transactions & Settlements
```
GET    /api/groups/[groupId]/transactions          - List transactions
GET    /api/groups/[groupId]/settlement-overview   - Calculate balances (read-only)
POST   /api/groups/[groupId]/transactions/settle   - Mark transaction(s) as settled
```

---

## UI Component Changes

### New Components Needed
1. **GroupSelector** - Dropdown/tabs for switching between user's groups
2. **GroupCard** - Display group info with join/manage actions
3. **GroupSettings** - Admin settings for group configuration
4. **GroupMembersList** - List and manage group members
5. **CreateGroupModal** - Form for creating new groups
6. **JoinGroupModal** - UI for joining public/private groups (with invite code input)
7. **EventCreator** - Admin form for creating single or recurring events
8. **InviteMemberModal** - Generate and share invite links
9. **PublicGroupsView** - Browse and join public groups

### Modified Components
1. **Header** - Add group selector, show current group context
2. **ScheduleTab** - Scoped to selected group, fetch from group's spreadsheet
3. **MarketplaceTab** - Show offered spots within current group
4. **SettlementTab** - Simplified: read-only balance overview from Transactions
5. **ScheduleCard** - Use new EventAttendees structure instead of player strings

### Removed/Deprecated
1. **TournamentSplash** - Tournament is now just an event type
2. **TournamentTeams** - Not needed in new structure
3. **TournamentVideo/Modal** - Can be removed or made generic
4. **SettlementBatchesView** - Replaced by simpler transaction-based settlement

---

## Naming Conventions

### Sheet Names
- PascalCase: `AppUsers`, `GroupMembers`, `EventAttendees`

### Column Names
- camelCase: `userEmail`, `groupId`, `createdAt`

### API Routes
- kebab-case for multi-word paths: `/api/groups/[groupId]/events`
- RESTful naming conventions

### ID Format
- **Users**: Email address is the unique identifier (no UUID)
- **Groups, Events, Attendees, Transactions**: UUID v4
- UUID Format: `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`

### Date/Time Formats
- Dates: `YYYY-MM-DD` (ISO 8601)
- Times: `HH:MM` (24-hour format)
- Timestamps: Full ISO 8601 with timezone

---

## Design Decisions (Confirmed)

The following decisions have been made:

1. ✅ **Hybrid Spreadsheet Architecture**: Master spreadsheet for users/groups/memberships + separate spreadsheet per group for events/attendees/transactions.

2. ✅ **Email as User ID**: No UUID for users. Email is the unique identifier throughout the system.

3. ✅ **No Swaps**: Swap functionality deprecated. Users can only offer spots and others can claim them.

4. ✅ **Recurring Events**: Supported via bulk creation. Each occurrence is a separate event record.

5. ✅ **Per-Event Slot Cost**: Each event has its own `slotCost` field (no group-level cost settings).

6. ✅ **Simplified User Records**: Only email, displayName, role, createdAt. Avatar from Google profile.

7. ✅ **Simplified Settlements**: No batch system. Transactions have `settledAt` timestamp. Overview is read-only.

8. ✅ **User Roles**: Only `admin` and `user` roles at global level. Group roles are `admin` / `member`.

---

## Implementation Progress

### Phase 1: Foundation ✅ COMPLETED
1. ✅ Master spreadsheet created with AppUsers, Groups, GroupMembers sheets
2. ✅ Created `lib/types.ts` with all TypeScript interfaces for the new schema
3. ✅ Created `lib/masterSheet.ts` for master spreadsheet operations
4. ✅ Created `lib/groupSheet.ts` for per-group spreadsheet operations
5. ✅ Created API endpoint `/api/user/profile`
6. ✅ Updated auth to register users in AppUsers on login
7. ✅ Created `/api/setup` for first-time bootstrap

### Phase 2: Group Management ✅ COMPLETED
1. ✅ Created `lib/driveService.ts` for auto-creating spreadsheets in Drive folder
2. ✅ Created `POST /api/groups` - Create group (auto-creates spreadsheet)
3. ✅ Created `GET /api/groups` - List user's groups
4. ✅ Created `GET /api/groups/public` - List public groups
5. ✅ Created `POST /api/groups/join` - Join group (public or invite code)
6. ✅ Created `GET /api/groups/[groupId]` - Get group details
7. ✅ Created `DELETE /api/groups/[groupId]` - Archive group
8. ✅ Created `GET /api/groups/[groupId]/members` - List members
9. ✅ Created `POST /api/groups/[groupId]/members` - Add member (admin)

### Phase 3: Events ✅ COMPLETED
1. ✅ Created `GET/POST /api/groups/[groupId]/events` - List and create events
2. ✅ Created `POST /api/groups/[groupId]/events/bulk` - Bulk create recurring events
3. ✅ Created `GET/DELETE /api/groups/[groupId]/events/[eventId]` - Get/cancel event
4. ✅ Created `POST .../events/[eventId]/claim` - Claim available or offered spot
5. ✅ Created `POST .../events/[eventId]/offer` - Offer spot for grabs
6. ✅ Created `POST .../events/[eventId]/retract` - Retract offered spot
7. ✅ Created `POST .../events/[eventId]/reassign` - Admin reassignment

### Phase 4: UI Development ✅ COMPLETED
1. ✅ Removed legacy components and API routes
2. ✅ Updated app layout and metadata (Hoops Master branding)
3. ✅ Created new Header and Footer components (dark theme)
4. ✅ Created main page with group selector
5. ✅ Created GroupList component
6. ✅ Created CreateGroupModal component  
7. ✅ Created JoinGroupModal component
8. ✅ Created GroupDashboard with tabs (Events, Members, Settings)
9. ✅ Created CreateEventModal (single + recurring)
10. ✅ Created EventDetailModal with claim/offer/retract actions

### Next: Phase 5 - Polish & Deployment
1. 🔄 Add settlement overview
2. 🔄 Add member management (invite, remove)
3. 🔄 Polish UI and add loading states
4. 🔄 Test and deploy

---

*Document created: December 13, 2025*
*Version: 1.3 (Phase 1 completed)*

