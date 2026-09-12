# Fab.Rent: find the factory that can make it

The September 9, 2026 request restores the original fabrication/manufacturing intent. Fab.Rent is positioned as an American B2B sourcing marketplace. “America’s Alibaba” informs the sourcing model; it is not a claim of affiliation or equivalent supplier scale.

## Delivered experience

- Search-first manufacturing homepage with separate **Have it made** and **Buy wholesale** paths; responsive navigation, readable controls, categories, region, minimum-order, lead-time, and capacity filters.
- Six fictional supplier profiles, a persistent browser shortlist, capability comparison, and expandable evidence checklists. Actual production location is distinguished from a business address; no verification is claimed.
- Guided sourcing briefs with optional specifications, keyword-based process suggestions, supplier selection, review, and local attachments (five files, 10 MB each, 25 MB total). Closing a brief keeps it available to resume in the same tab.
- Project workspace with brief revisions, attachment downloads, demo conversations, quote comparison, and first-order next steps. An example 1,000-bracket project demonstrates how the lowest unit price differs from the lowest subtotal.
- Quote comparison includes quantities, unit costs, tooling, shipping, inspection, lead time, validity, assumptions and exclusions. Different quantities, specifications, or exclusions are flagged and excluded from comparable highlights. Totals exclude taxes and are not presented as landed cost.
- Three illustrative wholesale products have variants, stock examples, quantity pricing, sample requests, and inquiry drafts. No order or payment is placed.
- Supplier workspace supports demo quotes, questions, declines, and dated availability declarations. These update the buyer-facing preview; expired declarations require confirmation.
- Forest-green and warm-neutral design with generated catalog illustrations, earlier search placement, mobile offer cards and mobile project/supplier navigation.

## Product model

| Rental concept | Manufacturing concept |
| --- | --- |
| Equipment for hire | Capability / made-to-order product |
| Hourly or daily rate | Request for quote |
| Booking dates | Desired delivery date / typical lead time |
| Reserve equipment | Prepare a production brief |
| Rental provider | Manufacturer and production location |
| Favorites | Supplier shortlist |
| Deposit / handoff / return | Specification / quote / production / delivery (future transaction model) |

A US office address is not evidence of US manufacturing. Before live launch, capture production location, identity evidence, and certification scope and validity. The prototype makes no verified-supplier claim.

## Integration and scope

`app/page.tsx` mounts the shared React marketplace. The former rental homepage moved unchanged to `/rental-home`. Rental routes, records, permissions, payments, and operational consoles remain intact; this work does not relabel rental transactions as manufacturing orders.

`preview/main.tsx` mounts those same components into the static preview built with `pnpm build:preview`. The script uses locked transitive esbuild and PostCSS installations. `.openai/hosting.json` serves only `dist`. The full app retains its original Next.js build and package manager.

Shortlist IDs use local browser storage. Project drafts, quotes, availability, conversations, and attachments stay in memory and reset on a page reload. Files can be selected, previewed where supported, removed, or downloaded locally; they are never uploaded, analyzed, or transmitted. Brief text exports list attachment names but do not include file contents. Supplier replies are simulated. The preview has no live messages, account creation, or transactions.

For live manufacturing transactions, introduce separate supplier/capability, RFQ, quote, and order records; onboarding and verification; authenticated quote delivery; attachment access controls; and a production-order lifecycle. Existing rental payment and booking semantics need separate product design.

## UX references

- [Thomasnet supplier discovery](https://help.thomasnet.com/search-for-suppliers): capability, company type, and location discovery.
- [Alibaba RFQ](https://seller.alibaba.com/learningcenter/content/detail/PX2U9ID5.htm): buyer requirements as an alternate entry point.
- [Xometry workflow](https://www.xometry.com/how-xometry-works/): process, material, finish, and quantity as quoting inputs.

## Validation scope

TypeScript, lint, unit tests, and standalone bundle validation cover this redesign. Regression tests cover search phrasing and filters, exact cost totals, noncomparable offers, integer-cent parsing, price-tier boundaries, process matching, and attachment export scope. Browser UI testing was not requested. The optional WebMCP search uses the same filters and visible state; no supported WebMCP validation context was available, so that optional integration is unverified.
