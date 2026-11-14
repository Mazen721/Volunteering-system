# Design System — Mansoura National University Volunteer Certificate

**Route:** `/certificate/:volunteerId`  
**Core Component:** [`CertificateSheet.jsx`](client/src/components/certificate/CertificateSheet.jsx) inside [`CertificatePage.jsx`](client/src/pages/CertificatePage.jsx)  
**Approved Reference Comp:** [`.impeccable/mocks/decision/assigned.png`](.impeccable/mocks/decision/assigned.png) — *Illuminated Geometric Academic Folio*

---

## 1. Visual Identity & Surfaces

- **Folio Surface (`--color-cert-paper`):** `#ffffff` pure crisp archival sheet (prints cleanly on standard white office/certificate paper with zero background ink waste).
- **Primary Institutional Navy (`--color-cert-navy`):** `#091b3f` — outer/inner perimeter double frame rules, geometric corner plates, crest ring, official seal, and 3-column credential table hairlines (`1.5px`).
- **Antique Academic Gold (`--color-cert-gold`):** `#92845c` (accent shimmer `--color-cert-gold-light`: `#d4af37`) — inner bevel perimeter trim, horizontal header rule, concave double-hairline name cartouche, crest laurel & monogram accents, and print CTA highlight.
- **Primary Ink (`--color-cert-ink`):** `#0e0e0e` — Arabic calligraphic heading, volunteer name, credential metadata, citation, and issue date.
- **Print-Hidden Screen Action Bar:** `#ffffff` elevated card with `#091b3f` primary print CTA (`#d4af37` printer icon) and crisp slate navigation links (`print:hidden`).

---

## 2. Typography (Self-Hosted via `@fontsource`)

Loaded locally in [`client/src/main.jsx`](client/src/main.jsx) with zero external Google Fonts network requests:

- **Display Calligraphic Title (`--font-cert-display`):** `'Aref Ruqaa', 'Scheherazade New', serif` (`400`, `5.20cqw`) for `AR.certificate.heading` (*شهادة تقدير وإثبات مشاركة تطوعية*).
- **Institutional Body & Credentials (`--font-cert-body`):** `'Noto Naskh Arabic', 'Cairo', sans-serif`
  - Top flanking titles (`جامعة المنصورة الأهلية` / `مركز المسؤولية المجتمعية`): `700`, `2.70cqw`
  - Volunteer full name inside cartouche: `700`, responsive by character count (`4.55cqw` <= 24 chars, `3.45cqw` <= 34 chars, `2.85cqw` > 34 chars)
  - 3-column metadata table & body citation: `1.92cqw`–`2.28cqw` (`facultyLength > 26` auto-scales to `1.58cqw`).

---

## 3. Structural & Print Specifications

- **Aspect Ratio & Responsive Scaling:** Fixed `aspect-ratio: 1264 / 848` (`container-type: inline-size`) so `cqw` typography and `%` coordinates scale proportionally from `390px` mobile to `1440px` desktop without overflow or wrapping.
- **Perimeter & Corner Grammar:** Symmetrical 4-corner illuminated geometric rosette plates (`client/src/assets/plates/corner-*.png`) mitered cleanly via `CORNER_BEVEL_CAPS` into continuous `#091b3f` double perimeter bars and `#92845c` inner trim.
- **Centered Name Cartouche:** Flex-centered (`inset-x-0 flex justify-center`) concave double-hairline `.cert-name-cartouche` with radial quarter-circle notches (`.cert-cartouche-notch--*`) so RTL rendering never shifts off-axis.
- **Credential Strip:** RTL `grid-cols-[29fr_42fr_29fr]` bordered in `#091b3f` (`1.5px`) with explicit standing vertical dividers (`border-l-[1.5px]`) separating Category, Faculty/Entity, and Volunteer ID.
- **Print Media (`@page` & `@media print`):** `@page { size: A4 landscape; margin: 6mm; }` — guarantees a single-page crisp A4 landscape output.
