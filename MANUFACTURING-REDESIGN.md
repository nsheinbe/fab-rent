# Fab.Rent: find the factory that can make it

The September 9, 2026 request restores the original fabrication/manufacturing intent. Fab.Rent is positioned as an American B2B sourcing marketplace. “America’s Alibaba” informs the sourcing model; it is not a claim of affiliation or equivalent supplier scale.

## Delivered experience

- Responsive manufacturing homepage with categories, product/capability search, US region, minimum-order and earliest-lead-time filters.
- Manufacturer and product/part views. Products are made to specification, not stocked inventory with invented prices.
- Profiles showing capabilities, materials, minimum order, production scale, and illustrative lead-time ranges.
- Device-local shortlist and comparison for two or three manufacturers.
- Project brief → RFQ review → text-download flow, with selected example suppliers attached. No messages are sent.
- Manufacturer onboarding draft for company details, production location, and capabilities. It is downloaded, not submitted.
- Forest-green and warm-neutral visual system. Images are generated illustrations; all six suppliers are fictional and visibly labeled.

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

Shortlist IDs use local browser storage. RFQ details stay in React memory in the current tab and can be downloaded. Reference links are never fetched. The preview has no file uploads, messages, account creation, or transactions.

For live manufacturing transactions, introduce separate supplier/capability, RFQ, quote, and order records; onboarding and verification; authenticated quote delivery; attachment access controls; and a production-order lifecycle. Existing rental payment and booking semantics need separate product design.

## UX references

- [Thomasnet supplier discovery](https://help.thomasnet.com/search-for-suppliers): capability, company type, and location discovery.
- [Alibaba RFQ](https://seller.alibaba.com/learningcenter/content/detail/PX2U9ID5.htm): buyer requirements as an alternate entry point.
- [Xometry workflow](https://www.xometry.com/how-xometry-works/): process, material, finish, and quantity as quoting inputs.

## Validation scope

TypeScript, lint, unit tests, and standalone bundle validation cover this redesign. Search regressions cover buyer phrasing, production scale, state aliases, hyphenated materials, and combined filters. Browser UI testing was not requested. The optional WebMCP search uses the same filters and visible state; no supported WebMCP validation context was available, so that optional integration is unverified.
