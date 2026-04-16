# TAFAKAH Food - Trade Document Management

Web application for **TAFAKAH Food (Shanghai)** to generate and manage export trade documents.

## Document Types

- **Sales Contract** — Export sales agreements
- **Commercial Invoice** — Shipment billing documents
- **Customs Invoice** — Customs declaration invoices
- **Packing List** — Detailed shipment packing lists

## Tech Stack

- [Next.js 15](https://nextjs.org/) — React framework with App Router
- [TypeScript](https://www.typescriptlang.org/) — Type safety
- [Tailwind CSS v4](https://tailwindcss.com/) — Utility-first styling
- [shadcn/ui](https://ui.shadcn.com/) — Component library
- [Lucide Icons](https://lucide.dev/) — Icon set

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Project Structure

```
src/
├── app/            # Next.js App Router pages and layouts
├── components/
│   ├── layout/     # Layout components (header, footer, sidebar)
│   └── ui/         # shadcn/ui components
├── lib/            # Utility functions and shared logic
└── types/          # TypeScript type definitions
```

## Roadmap

- [ ] Phase 1: Project foundation (current)
- [ ] Phase 2: Database and authentication
- [ ] Phase 3: Trade document generation
- [ ] Phase 4: AI document scanning and merging (CO, B/L, Phyto certificates)
