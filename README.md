# Staff Bus Locator

A real-time staff bus locator and car park tracking web application built with **Next.js 16**, **React 19**, **Tailwind CSS**, and **Supabase**.

## Features

- **Live Bus Search**: Instant search by bus number or route name.
- **Interactive Bus Details**: Click any search result or shuttle to view its assigned zone, bay slot, and walking directions from the main entrance in a mobile-responsive dialog.
- **Car Park Zone Inspector**: Click any zone to see real-time parking capacity, visual bay slot maps, and list of parked shuttles.
- **Transport Admin Dashboard**: Fast location updater for transport marshals with real-time sync across all devices.
- **Super Admin Management**: Full control over car park zones, bay capacities, routes, and active bus registers.
- **Supabase Realtime**: Live updates without page refreshes.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Frontend**: React 19, Tailwind CSS v4, Lucide Icons
- **Backend / Database**: Supabase (PostgreSQL with Realtime WebSockets)

## Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/Sirsystem4/staff-bus-locator.git
cd staff-bus-locator
```

### 2. Install dependencies
```bash
pnpm install
```

### 3. Configure environment variables
Copy `.env.example` to `.env.local` and add your Supabase credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Run the development server
```bash
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application.

## Build for Production
```bash
pnpm build
pnpm start
```
