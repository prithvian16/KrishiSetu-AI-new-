# KrishiSetuAI — SIH PS 26032 prototype

Stack: HTML, CSS, JavaScript, Node.js, Express.js, MongoDB/Mongoose.

## Interfaces
- **Farmer App:** phone-style app containing registration, crop registration, optional pre-arrival quality check, smart centre recommendation, booking, live queue, status notifications and profile.
- **Procurement Centre:** website dashboard for capacity, live queue, calling farmers and verification operations.
- **Inspector:** website dashboard for official physical verification.
- **Government:** website dashboard for system-wide queue, capacity, arrivals, procurement and congestion analytics.

## Demo seed
```bash
npm install
node seed.js
node server.js
```

Then open `http://localhost:8080`.

Demo farmer login:
- Mobile: `9999999999`
- Farmer ID: `KSF-DEMO-001`
- Demo queue token: `CENTREB-047`

The seed is idempotent for its deterministic demo records and preserves user-created records.

## Prototype boundaries
Government integrations, preliminary crop assessment and payment processing are simulated. The official crop decision remains a separate physical verification workflow. Production needs authorised integrations, authentication/RBAC, encryption, audit logs, secure image storage, rate limiting and validated models.
