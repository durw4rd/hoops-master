# Hoops Master 🏀

A multi-group sports event management platform. Organize games, manage your crew, and never miss a session.

## Overview

Hoops Master helps sports organizers create and manage groups for recurring events like basketball sessions, pickup games, or league play. Players can join groups, claim spots in events, offer their spots to others, and track their participation.

## Features

### 👥 Multi-Group Support
- Create multiple groups for different communities or sports
- Public groups anyone can join, or private invite-only groups
- Unique invite codes for private group access
- Role-based access (admins vs regular members)

### 📅 Event Management
- Create single events or recurring event series
- Flexible scheduling with 15-minute time intervals
- Configurable signup timing (immediate, days before, or specific date)
- Track attendance with spot limits

### 🎫 Spot Management
- Claim available spots in events
- Offer your spot when you can't make it
- Retract offered spots before they're claimed
- Admin reassignment capabilities

### 🎨 Modern UI
- "Subway Court Kings" graffiti-inspired design
- Mobile-optimized interface
- Responsive layouts for all screen sizes

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Authentication**: NextAuth.js with Google OAuth
- **Database**: Google Sheets (via Google Sheets API)
- **Styling**: Tailwind CSS
- **UI Components**: Radix UI / shadcn/ui
- **Feature Flags**: LaunchDarkly

## Getting Started

### Prerequisites
- Node.js 18+
- pnpm (recommended) or npm
- Google Cloud Platform project with Sheets API enabled
- Google Service Account with appropriate permissions

### Environment Variables

Create a `.env.local` file with:

```bash
# Google OAuth (for user authentication)
GOOGLE_CLIENT_ID=your-oauth-client-id
GOOGLE_CLIENT_SECRET=your-oauth-client-secret

# Google Service Account (for Sheets API)
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Master Spreadsheet ID
GOOGLE_SHEET_ID=your-master-spreadsheet-id

# Google Drive Folder for group spreadsheets
GOOGLE_DRIVE_FOLDER_ID=your-drive-folder-id

# NextAuth
NEXTAUTH_SECRET=your-random-secret
NEXTAUTH_URL=http://localhost:3000

# LaunchDarkly (optional)
NEXT_PUBLIC_LD_CLIENT_ID=your-launchdarkly-client-id
```

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/hoops-master.git
cd hoops-master

# Install dependencies
pnpm install

# Run development server
pnpm dev
```

### Initial Setup

1. Create a Google Spreadsheet for master data
2. Share it with your service account email (Editor access)
3. Create a Google Drive folder for group spreadsheets
4. Share the folder with your service account (Editor access)
5. Run the setup endpoint: `POST /api/setup`

## Architecture

See [APP_ARCHITECTURE.md](./APP_ARCHITECTURE.md) for detailed technical documentation.

### Hybrid Spreadsheet Structure

**Master Spreadsheet** (global data):
- `AppUsers` - Registered users
- `Groups` - Group metadata
- `GroupMembers` - User-group relationships

**Per-Group Spreadsheets** (created per group):
- `Events` - Event schedule
- `EventAttendees` - Event participation
- `Transactions` - Spot transfer records

## Usage

### For Organizers

1. **Sign in** with your Google account
2. **Create a group** with name, description, and visibility settings
3. **Create events** (single or recurring series)
4. **Share invite code** with players (for private groups)
5. **Manage members** and events from the dashboard

### For Players

1. **Sign in** with your Google account
2. **Join a group** using invite code or browse public groups
3. **View upcoming events** in the group dashboard
4. **Claim spots** when signup opens
5. **Offer your spot** if you can't make it

## API Endpoints

### Authentication & Setup
- `POST /api/setup` - Initialize master spreadsheet

### User Management
- `GET /api/user/profile` - Get current user profile

### Groups
- `GET /api/groups` - List user's groups
- `POST /api/groups` - Create new group
- `GET /api/groups/public` - List public groups
- `POST /api/groups/join` - Join a group
- `GET /api/groups/[groupId]` - Get group details
- `PATCH /api/groups/[groupId]` - Update group settings
- `GET /api/groups/[groupId]/members` - List group members

### Events
- `GET /api/groups/[groupId]/events` - List events
- `POST /api/groups/[groupId]/events` - Create event
- `POST /api/groups/[groupId]/events/bulk` - Create recurring events
- `GET /api/groups/[groupId]/events/[eventId]` - Get event details

### Spot Management
- `POST /api/groups/[groupId]/events/[eventId]/claim` - Claim spot
- `POST /api/groups/[groupId]/events/[eventId]/offer` - Offer spot
- `POST /api/groups/[groupId]/events/[eventId]/retract` - Retract offer

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT

---

**Hoops Master** - Get in the game! 🏀
