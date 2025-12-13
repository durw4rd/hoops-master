# Hoops Master - Application Architecture

## Overview

Hoops Master is a Next.js 15 application for managing multi-group sports events. It uses a hybrid Google Sheets architecture for data persistence, Google OAuth for authentication, and features a graffiti-inspired "Subway Court Kings" UI theme.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js)                       │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐│
│  │   Header    │ │   Footer    │ │   Group Components      ││
│  └─────────────┘ └─────────────┘ │  - GroupList            ││
│                                   │  - GroupDashboard       ││
│                                   │  - CreateGroupModal     ││
│                                   │  - CreateEventModal     ││
│                                   │  - EventDetailModal     ││
│                                   └─────────────────────────┘│
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    API Routes (Next.js)                      │
│  /api/user/profile     /api/groups          /api/setup      │
│  /api/groups/[id]/events    /api/groups/[id]/members        │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Service Layer                              │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │   masterSheet.ts │  │   groupSheet.ts  │                 │
│  │   (AppUsers,     │  │   (Events,       │                 │
│  │    Groups,       │  │    Attendees,    │                 │
│  │    GroupMembers) │  │    Transactions) │                 │
│  └──────────────────┘  └──────────────────┘                 │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Google Sheets API                          │
│  ┌─────────────────────┐  ┌───────────────────────────────┐ │
│  │  Master Spreadsheet │  │  Per-Group Spreadsheets       │ │
│  │  - AppUsers         │  │  - Events                     │ │
│  │  - Groups           │  │  - EventAttendees             │ │
│  │  - GroupMembers     │  │  - Transactions               │ │
│  └─────────────────────┘  └───────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Core Data Types

### AppUser
```typescript
interface AppUser {
  email: string;           // Primary key (Google login email)
  displayName: string;     // User's display name
  globalRole: 'superadmin' | 'user';  // Application-wide role
  createdAt: string;       // ISO timestamp
}
```

### Group
```typescript
interface Group {
  groupId: string;         // UUID primary key
  name: string;            // Group name
  description: string;     // Group description
  visibility: 'public' | 'private';
  spreadsheetId: string;   // ID of group's data spreadsheet
  defaultEventSpots: number;
  createdBy: string;       // Email of creator
  createdAt: string;       // ISO timestamp
  inviteCode: string;      // 8-char code for private groups
  status: 'active' | 'archived';
}
```

### GroupMember
```typescript
interface GroupMember {
  groupId: string;         // FK to Groups
  userEmail: string;       // FK to AppUsers
  groupRole: 'admin' | 'member';
  joinedAt: string;        // ISO timestamp
  invitedBy: string;       // Email of inviter
  status: 'active' | 'inactive';
}
```

### Event
```typescript
interface Event {
  eventId: string;         // UUID primary key
  date: string;            // YYYY-MM-DD format
  startTime: string;       // HH:MM format
  endTime: string;         // HH:MM format
  totalSpots: number;      // Maximum players
  slotCost: number;        // Cost per slot
  location: string;        // Venue name/address
  description: string;     // Event notes
  eventType: 'regular' | 'tournament' | 'special';
  status: 'scheduled' | 'cancelled' | 'completed';
  signupOpensAt: string;   // ISO timestamp when signup opens
  createdBy: string;       // Email of creator
  createdAt: string;       // ISO timestamp
}
```

### EventAttendee
```typescript
interface EventAttendee {
  attendeeId: string;      // UUID primary key
  eventId: string;         // FK to Events
  userEmail: string;       // FK to AppUsers
  originalUserEmail: string; // Original holder (for transfers)
  status: 'confirmed' | 'offered' | 'cancelled';
  offeredAt?: string;      // When spot was offered
  assignedBy?: string;     // Admin who assigned
  assignedAt?: string;     // When admin assigned
}
```

### Transaction
```typescript
interface Transaction {
  transactionId: string;   // UUID primary key
  eventId: string;         // FK to Events
  attendeeId: string;      // FK to EventAttendees
  type: 'claim' | 'offer' | 'retract' | 'reassign';
  fromUserEmail: string;   // Source user
  toUserEmail: string;     // Target user
  amount: number;          // Calculated slot cost
  timestamp: string;       // ISO timestamp
  settledAt?: string;      // When payment settled
  notes?: string;
}
```

## Database Schema

### Master Spreadsheet

**AppUsers Sheet**
| Column | Field | Type |
|--------|-------|------|
| A | email | String (PK) |
| B | displayName | String |
| C | globalRole | Enum |
| D | createdAt | ISO Date |

**Groups Sheet**
| Column | Field | Type |
|--------|-------|------|
| A | groupId | UUID (PK) |
| B | name | String |
| C | description | String |
| D | visibility | Enum |
| E | spreadsheetId | String |
| F | defaultEventSpots | Number |
| G | createdBy | Email |
| H | createdAt | ISO Date |
| I | inviteCode | String(8) |
| J | status | Enum |

**GroupMembers Sheet**
| Column | Field | Type |
|--------|-------|------|
| A | groupId | UUID (FK) |
| B | userEmail | Email (FK) |
| C | groupRole | Enum |
| D | joinedAt | ISO Date |
| E | invitedBy | Email |
| F | status | Enum |

### Per-Group Spreadsheet

**Events Sheet**
| Column | Field | Type |
|--------|-------|------|
| A | eventId | UUID (PK) |
| B | date | YYYY-MM-DD |
| C | startTime | HH:MM |
| D | endTime | HH:MM |
| E | totalSpots | Number |
| F | slotCost | Number |
| G | location | String |
| H | description | String |
| I | eventType | Enum |
| J | status | Enum |
| K | signupOpensAt | ISO Date |
| L | createdBy | Email |
| M | createdAt | ISO Date |

**EventAttendees Sheet**
| Column | Field | Type |
|--------|-------|------|
| A | attendeeId | UUID (PK) |
| B | eventId | UUID (FK) |
| C | userEmail | Email |
| D | originalUserEmail | Email |
| E | status | Enum |
| F | offeredAt | ISO Date |
| G | assignedBy | Email |
| H | assignedAt | ISO Date |

**Transactions Sheet**
| Column | Field | Type |
|--------|-------|------|
| A | transactionId | UUID (PK) |
| B | eventId | UUID (FK) |
| C | attendeeId | UUID (FK) |
| D | type | Enum |
| E | fromUserEmail | Email |
| F | toUserEmail | Email |
| G | amount | Number |
| H | timestamp | ISO Date |
| I | settledAt | ISO Date |
| J | notes | String |

## API Routes

### Setup & Authentication

#### `POST /api/setup`
Initialize master spreadsheet and create first superadmin.
- **Auth**: None (bootstrap endpoint)
- **Returns**: Setup status and created user

#### `GET /api/user/profile`
Get current user's profile and group memberships.
- **Auth**: Required
- **Returns**: UserProfile with groups array

### Groups

#### `GET /api/groups`
List groups the user is a member of.
- **Auth**: Required
- **Returns**: Array of Group objects

#### `POST /api/groups`
Create a new group.
- **Auth**: Required (admin only)
- **Body**: `{ name, description, visibility, defaultEventSpots, spreadsheetId? }`
- **Returns**: Created Group object

#### `GET /api/groups/public`
List all public groups.
- **Auth**: Required
- **Returns**: Array of public Group objects

#### `POST /api/groups/join`
Join a group by groupId or inviteCode.
- **Auth**: Required
- **Body**: `{ groupId? } | { inviteCode? }`
- **Returns**: Joined Group object

#### `GET /api/groups/[groupId]`
Get group details.
- **Auth**: Required (member or public group)
- **Returns**: Group with membership info

#### `PATCH /api/groups/[groupId]`
Update group settings.
- **Auth**: Required (admin only)
- **Body**: `{ visibility?, description?, defaultEventSpots? }`
- **Returns**: Updated Group

#### `GET /api/groups/[groupId]/members`
List group members.
- **Auth**: Required (member only)
- **Returns**: Array of member info

### Events

#### `GET /api/groups/[groupId]/events`
List group events.
- **Auth**: Required (member only)
- **Query**: `includePast?, from?, to?`
- **Returns**: Array of Event objects with counts

#### `POST /api/groups/[groupId]/events`
Create a single event.
- **Auth**: Required (admin only)
- **Body**: `{ date, startTime, endTime, totalSpots, slotCost?, location?, signupOpenType?, signupOpenValue? }`
- **Returns**: Created Event

#### `POST /api/groups/[groupId]/events/bulk`
Create recurring events.
- **Auth**: Required (admin only)
- **Body**: `{ startDate, endDate, dayOfWeek, startTime, endTime, ... }`
- **Returns**: Array of created Events

#### `GET /api/groups/[groupId]/events/[eventId]`
Get event details with attendees.
- **Auth**: Required (member only)
- **Returns**: Event with attendees array

### Spot Management

#### `POST /api/groups/[groupId]/events/[eventId]/claim`
Claim a spot in an event.
- **Auth**: Required (member only)
- **Body**: `{ attendeeId? }` (for claiming offered spots)
- **Validation**: Checks signupOpensAt before allowing

#### `POST /api/groups/[groupId]/events/[eventId]/offer`
Offer your spot to others.
- **Auth**: Required (spot holder only)

#### `POST /api/groups/[groupId]/events/[eventId]/retract`
Retract an offered spot.
- **Auth**: Required (spot holder only)

## Core Components

### Layout Components

- **Header** - Logo, user info, navigation
- **Footer** - Copyright, branding

### Group Components

- **GroupList** - Display user's groups
- **GroupDashboard** - Main group view with tabs (Events, Members, Settings)
- **CreateGroupModal** - Form for creating new groups
- **JoinGroupModal** - Join via code or browse public groups

### Event Components

- **CreateEventModal** - Single or recurring event creation
- **EventDetailModal** - Event details, attendees, spot actions

## Service Layer

### `lib/masterSheet.ts`
Handles master spreadsheet operations:
- `getMasterSheetsClient()` - Get authenticated Sheets client
- `getOrCreateUser()` - Ensure user exists in AppUsers
- `createGroup()` - Create new group record
- `getGroups()` / `getPublicGroups()` - Query groups
- `joinGroup()` - Add member to group
- `updateGroup()` - Update group settings

### `lib/groupSheet.ts`
Handles per-group spreadsheet operations:
- `getGroupSheetsClient()` - Get client for group spreadsheet
- `initializeGroupSpreadsheet()` - Create sheets with headers
- `createEvent()` / `bulkCreateEvents()` - Create events
- `getEvents()` / `getEventById()` - Query events
- `getEventAttendees()` - Get attendees for event
- `claimSpot()` / `offerSpot()` / `retractSpot()` - Manage spots
- `createTransaction()` - Record spot transactions

### `lib/driveService.ts`
Handles Google Drive operations:
- `createSpreadsheetInFolder()` - Create group spreadsheet

### `lib/auth.ts`
NextAuth.js configuration with Google OAuth.

## UI Theme: "Subway Court Kings"

### Color Palette
| Name | Hex | Usage |
|------|-----|-------|
| Concrete Canvas | `#E8E4DE` | Background |
| Asphalt Black | `#1A1A1A` | Text, borders |
| Subway Orange | `#FF6B1A` | Primary CTA |
| Electric Blue | `#3B9EFF` | Secondary |
| Slime Green | `#7FFF00` | Success |
| Sunflare Yellow | `#FFD700` | Warnings |
| Purple Accent | `#8B5CF6` | Accents |

### Typography
- **Bangers** - Graffiti headlines
- **Permanent Marker** - Handwritten accents
- **Inter** - Body text

### Custom CSS Classes
- `.font-graffiti` - Bubble letter font
- `.font-marker` - Handwritten font
- `.sticker-btn` - 3D button style
- `.marker-card` - Hand-drawn card border
- `.tag-label` - Tilted label style
- `.badge-*` - Colored badges
- `.concrete-bg` - Textured background

## Authentication Flow

1. User clicks "Sign in with Google"
2. NextAuth redirects to Google OAuth
3. On success, JWT callback calls `getOrCreateUser()`
4. User is created in AppUsers if new
5. Session includes user email and name
6. API routes validate session for protected endpoints

## Signup Timing Feature

Events can have configurable signup timing:
- **Immediate** - Signup opens when event is created
- **Relative** - Opens X days before event at event start time
- **Absolute** - Opens at specific date/time

The `signupOpensAt` field stores the calculated ISO timestamp.

## Security

### Authentication
- Google OAuth required for all operations
- Session validated on every API request

### Authorization
- Global roles: `superadmin`, `user`
- Group roles: `admin`, `member`
- Actions checked against user's role

### Data Isolation
- Each group has its own spreadsheet
- Users can only access groups they're members of
- Public groups visible to all authenticated users

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account email |
| `GOOGLE_PRIVATE_KEY` | Service account private key |
| `GOOGLE_SHEET_ID` | Master spreadsheet ID |
| `GOOGLE_DRIVE_FOLDER_ID` | Folder for group spreadsheets |
| `NEXTAUTH_SECRET` | NextAuth encryption key |
| `NEXTAUTH_URL` | Application URL |
| `NEXT_PUBLIC_LD_CLIENT_ID` | LaunchDarkly client ID |

## Known Limitations

1. **No real-time updates** - Manual refresh required
2. **Google Sheets API limits** - Rate limiting applies
3. **No offline support** - Requires internet connection
4. **No push notifications** - Users must check app

## Future Considerations

- Add real-time updates via polling or WebSockets
- Implement caching layer for better performance
- Add email notifications for events
- Support multiple sports types
- Add financial settlement features
- Implement waiting lists for full events
