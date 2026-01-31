# Event Platform API - NestJS Backend

A high-performance event management platform with payment split functionality using NestJS, Prisma, PostgreSQL, and Pagar.me V5.

## 🏗️ Architecture Overview

This MVP implements a **Modular Monolith** architecture with:
- **Hybrid API**: GraphQL for client operations + REST for webhooks
- **Payment Split**: Automatic revenue distribution between platform and organizers
- **JSONB Flexibility**: PostgreSQL JSONB fields with GIN indexes for dynamic event content
- **Financial Immutability**: Snapshot-based transaction audit trail

## 📋 Features

### Core Modules
- **CoreModule**: Database connection (Prisma), global configuration
- **AuthModule**: JWT authentication with access/refresh tokens
- **PaymentModule**: Pagar.me V5 integration with split calculation
- **WebhookModule**: Secure webhook handling with signature validation
- **EventsModule**: Event CRUD with JSONB-powered flexible schemas
- **CheckoutModule**: Order processing with inventory management

### Key Capabilities
- ✅ User authentication with role-based access (Customer, Organizer, Admin)
- ✅ Organizer profile with payment recipient onboarding
- ✅ Event creation with flexible JSONB details (agenda, FAQ, custom fields)
- ✅ Ticket types with availability tracking
- ✅ Split payment calculation (Platform fee + Organizer share)
- ✅ Transaction idempotency for safe retries
- ✅ Webhook processing with HMAC-SHA256 signature validation
- ✅ Audit logging for payment splits (marketplace transparency)

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- PostgreSQL 14+
- Pagar.me account with API credentials

### Installation

1. **Clone and install dependencies**
```bash
npm install
```

2. **Configure environment variables**
```bash
cp .env.example .env
# Edit .env with your database URL and Pagar.me credentials
```

3. **Generate Prisma client and run migrations**
```bash
npm run prisma:generate
npm run prisma:migrate
```

4. **Start development server**
```bash
npm run start:dev
```

The API will be available at:
- REST API: `http://localhost:3333/api`
- GraphQL Playground: `http://localhost:3333/graphql`

## 📐 Database Schema

### Core Entities
- **User**: Authentication and identity
- **OrganizerProfile**: Public organizer information
- **PaymentRecipient**: Pagar.me recipient linkage (KYC data)
- **Event**: Event catalog with JSONB details field
- **TicketType**: Ticket variants with pricing and inventory
- **Order**: Purchase intent with status tracking
- **OrderItem**: Line items with price snapshots
- **Transaction**: Payment gateway integration records
- **SplitRuleLog**: Immutable audit trail for payment splits

### JSONB Usage
The `Event.details` field stores flexible content:
```json
{
  "description": "<p>Rich text HTML</p>",
  "agenda": [
    { "time": "10:00", "title": "Opening", "speaker": "John Doe" }
  ],
  "faq": [
    { "question": "What to bring?", "answer": "ID and ticket" }
  ],
  "settings": {
    "showRemainingTickets": true,
    "primaryColor": "#FF5733",
    "categories": ["tech", "workshop"]
  },
  "assets": {
    "bannerUrl": "https://cdn.example.com/banner.jpg",
    "gallery": ["url1", "url2"]
  }
}
```

GIN index on `details` enables efficient queries:
```sql
-- Find events with category "tech"
SELECT * FROM events WHERE details @> '{"settings": {"categories": ["tech"]}}';
```

## 💳 Payment Split Logic

### Split Calculation
```typescript
// Platform receives: (amount * 10%) + R$1.00
// Organizer receives: remaining amount
// Organizer pays MDR (Merchant Discount Rate)

const platformAmount = Math.floor(totalAmount * 0.10) + 100; // cents
const organizerAmount = totalAmount - platformAmount;
```

### Pagar.me Payload Structure
```json
{
  "amount": 10000,
  "payments": [{
    "payment_method": "credit_card",
    "split": [
      {
        "recipient_id": "re_platform",
        "amount": 1100,
        "liable": true,
        "charge_processing_fee": false
      },
      {
        "recipient_id": "re_organizer",
        "amount": 8900,
        "liable": true,
        "charge_processing_fee": true,
        "charge_remainder": true
      }
    ]
  }]
}
```

### Idempotency
Every transaction includes a unique `idempotency_key` to prevent duplicate charges if requests are retried.

## 🔐 Security

### Authentication
- JWT access tokens (15 min expiry)
- Refresh tokens (7 days) with rotation
- Password hashing with bcrypt (10 rounds)

### Webhook Security
Pagar.me webhooks are validated using HMAC-SHA256:
```typescript
const signature = crypto
  .createHmac('sha256', WEBHOOK_SECRET)
  .update(JSON.stringify(body))
  .digest('hex');
```

### Input Validation
- `class-validator` decorators on all DTOs
- Zod schemas for additional validation
- Global ValidationPipe with whitelist

### Rate Limiting
- ThrottlerModule: 10 requests/minute per IP
- Configurable per-route limits

## 🧪 API Examples

### Register User
```graphql
mutation {
  register(input: {
    email: "user@example.com"
    password: "SecurePass123"
    role: ORGANIZER
  }) {
    user { id email role }
    accessToken
    refreshToken
  }
}
```

### Create Event (Protected)
```graphql
mutation {
  createEvent(input: {
    title: "Tech Summit 2024"
    slug: "tech-summit-2024"
    startDate: "2024-12-01T09:00:00Z"
    endDate: "2024-12-01T18:00:00Z"
    details: {
      description: "<h1>Welcome</h1>"
      settings: { categories: ["tech", "networking"] }
    }
  }) {
    id
    slug
    status
  }
}
```

### Webhook Endpoint (REST)
```bash
POST /api/webhooks/pagarme
Headers:
  X-Hub-Signature: <hmac-sha256-signature>
  
Body: { "id": "tid_xxx", "status": "paid", ... }
```

## 📦 Project Structure

```
src/
├── core/              # Database, global services
│   └── services/
│       └── prisma.service.ts
├── auth/              # Authentication & authorization
│   ├── dto/
│   ├── guards/
│   ├── services/
│   └── strategies/
├── payment/           # Pagar.me integration
│   └── services/
│       └── pagarme.service.ts
├── webhook/           # Webhook handlers
│   ├── guards/
│   └── services/
├── events/            # Event management (TODO)
├── checkout/          # Order processing (TODO)
└── common/            # Shared decorators, filters, pipes
```

## 🔧 Available Scripts

```bash
npm run start:dev      # Development with hot-reload
npm run build          # Production build
npm run start:prod     # Run production build
npm run lint           # ESLint check and fix
npm run prisma:generate   # Generate Prisma Client
npm run prisma:migrate    # Run database migrations
npm run prisma:studio     # Open Prisma Studio GUI
```

## 🌐 Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/db` |
| `JWT_SECRET` | Secret for access tokens | `your-secret-key` |
| `JWT_REFRESH_SECRET` | Secret for refresh tokens | `your-refresh-secret` |
| `PAGARME_API_KEY` | Pagar.me API key | `sk_test_xxxxx` |
| `PAGARME_WEBHOOK_SECRET` | Webhook validation secret | `whsec_xxxxx` |
| `PAGARME_PLATFORM_RECIPIENT_ID` | Platform recipient ID | `re_xxxxx` |
| `PLATFORM_FEE_PERCENTAGE` | Platform commission % | `10` |
| `PLATFORM_FEE_FIXED` | Fixed fee in cents | `100` |

## 📝 Next Steps

### Immediate Priorities
1. ✅ Complete EventsModule with GraphQL resolvers
2. ✅ Implement CheckoutModule with inventory locking
3. ✅ Add ticket generation and QR code service
4. ✅ Email notifications (order confirmation, tickets)
5. ✅ Admin dashboard endpoints

### Future Enhancements
- [ ] Real-time seat selection (WebSockets)
- [ ] Refund processing
- [ ] Analytics and reporting
- [ ] Multi-currency support
- [ ] Recurring events
- [ ] Affiliate program

## 🤝 Contributing

This is an MVP implementation. Contributions welcome for:
- Additional payment methods (PIX, Boleto)
- Enhanced error handling
- Performance optimizations
- Test coverage

## 📄 License

ISC License

---

**Built with ❤️ using NestJS, Prisma, and TypeScript**
