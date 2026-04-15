# Financial Transparency and Accountability System

A secure, mobile-first web application for managing financial requests from beneficiaries through a complete lifecycle: submission, review, approval, verification, payment, and archival.

Live systems:
- Frontend: `https://orphanage-tracking-frontend.vercel.app`
- Backend: `https://financial-transparency-api.morgan-ent.workers.dev`

## Project Structure

```
orphanage-tracking-system/
├── frontend/          # Next.js 16 frontend application
├── workers/           # Cloudflare Workers backend API
└── .kiro/            # Kiro spec files
```

## Technology Stack

### Frontend
- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript (strict mode)
- **UI Library**: Material-UI v5
- **State Management**: React Context + TanStack Query
- **Form Management**: React Hook Form + Zod
- **Hosting**: Vercel

### Backend
- **Runtime**: Cloudflare Workers
- **Framework**: Hono
- **Database**: Cloudflare D1 (SQLite)
- **ORM**: Drizzle ORM
- **Storage**: Cloudflare R2
- **Cache**: Cloudflare KV
- **Queues**: Cloudflare Queues

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- Wrangler CLI (`npm install -g wrangler`)
- Cloudflare account (for deployment)

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend will be available at `http://localhost:3000`

### Backend Setup

```bash
cd workers
npm install
npm run dev
```

The API will be available at `http://localhost:8787`

### Environment Variables

#### Frontend
Copy `.env.local.example` to `.env.local` and configure:
```bash
NEXT_PUBLIC_API_URL=http://localhost:8787/api/v1
```

Production frontend uses:
```bash
NEXT_PUBLIC_API_URL=https://financial-transparency-api.morgan-ent.workers.dev/api/v1
```

#### Workers
Copy `.env.example` to `.env` and configure the required secrets.
For production, use `wrangler secret put <NAME>` to set sensitive values.

## Development Commands

### Frontend
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

### Workers
- `npm run dev` - Start local development server
- `npm run deploy` - Deploy to Cloudflare
- `npm run db:generate` - Generate database migrations
- `npm run db:migrate` - Apply migrations to D1
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

## Code Quality

Both frontend and workers are configured with:
- **TypeScript strict mode** for type safety
- **ESLint** for code quality
- **Prettier** for consistent formatting

Run linting before committing:
```bash
npm run lint
```

## Architecture

The system follows a modern edge-first architecture:
- Frontend deployed to Vercel
- Backend API running on Cloudflare Workers (edge compute)
- Database on Cloudflare D1 (SQLite at the edge)
- Document storage on Cloudflare R2
- Caching with Cloudflare KV
- Background jobs with Cloudflare Queues

## Key Features

- Role-based access control (Beneficiary, Admin Level 1, Admin Level 2, Superadmin)
- Complete request lifecycle management
- Document storage with version control
- IntaSend payout integration
- Email and SMS notifications
- Immutable audit logging
- Public transparency dashboard
- Public donor journey via `/donate`
- AI-assisted reporting and anomaly detection
- Mobile-first responsive design
- Offline support (PWA)

## Security

- All sensitive data encrypted at rest (AES-256)
- TLS 1.3 for data in transit
- JWT authentication with refresh tokens
- Password hashing with bcrypt (12 rounds)
- Role-based authorization
- Rate limiting
- Input validation with Zod

## License

Proprietary - Bethel Rays of Hope NGO
