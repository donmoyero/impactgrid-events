# ImpactGrid Events

> Book. Deliver. Repurpose.

Creator event delivery platform. Upload media once — clients get a cinematic gallery, downloads lock until payment, AI turns content into social posts.

---

## Structure

```
impactgrid-events/
│
├── index.html              ← Public homepage
├── event.html              ← Public event gallery (shared by all events)
├── shared.css              ← Design system — all tokens, reset, layout
├── nav.js                  ← Shared nav + footer injected on every page
│
├── auth/
│   ├── login.html
│   ├── join.html
│   └── success.html
│
├── dashboard/
│   ├── admin.html          ← Creator dashboard shell
│   ├── events-pages.html   ← Dashboard page fragments (events, upload, requests, reviews)
│   └── events-script.js    ← Firebase + Cloudinary logic
│
├── payments/               ← Stripe invoice + checkout (coming)
├── bookings/               ← Public creator pages + booking flow (coming)
├── ai/                     ← Recap + carousel generation (coming)
└── uploads/                ← Upload utilities (coming)
```

---

## Rules

| File | Purpose | Edit? |
|------|---------|-------|
| `shared.css` | Design tokens, reset, nav, layout, typography, buttons, cards | Only for system-wide changes |
| `nav.js` | Shared nav + footer injection | Only for nav link changes |
| `event.html` | Public gallery — one file handles all events via query params | Yes |
| `dashboard/admin.html` | Creator dashboard shell | Yes |
| `dashboard/events-script.js` | Firebase + Cloudinary logic | Yes |

**Do not** override `shared.css` tokens in page-level styles. Use page-specific `<style>` blocks for layout only.

---

## Tech Stack

| Layer | System |
|-------|--------|
| Frontend | Vanilla HTML / CSS / JS |
| Database | Firebase Firestore |
| Media | Cloudinary (preview + full-res) |
| Auth | Supabase |
| Payments | Stripe (coming) |
| API | Node.js on Render |
| Hosting | Static |

---

## Media Architecture

```
Cloudinary folders:
/events/{eventId}/preview/    ← compressed 1400px, public
/events/{eventId}/full/       ← original quality, protected

Download logic:
if (userHasPaid) → serve full/
else              → serve preview/
```

No watermarks. Preview-only until payment. Cleaner and more premium.

---

## Phases

- [x] Phase 1 — Gallery delivery + admin (live)
- [ ] Phase 2 — Auth + locked downloads + Stripe invoicing
- [ ] Phase 3 — Booking system + creator public pages
- [ ] Phase 4 — AI content engine (recaps, carousels, captions)
