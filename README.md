# DIGIX Asset Ops -- Frontend

Next.js web dashboard for the DIGIX Asset Management & Operations Platform.

## Stack

- Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- TanStack Query, React Hook Form + Zod, Leaflet maps, Recharts

## Quick Start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000

## Docker

```bash
docker build -f Dockerfile --target production -t digix-frontend .
docker run -p 3000:3000 digix-frontend
```

## Modules

Dashboard with 13 module routes: Assets, Sites, Tickets, Teams, Warranties, Maintenance, Infrastructure, Inventory, Suppliers, Clients, Procurement, Finance, Analytics.
