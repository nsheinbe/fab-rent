# Recorded Connect account shapes

Stripe `Account` objects in the shape the API returns (2025 API, Express accounts with the
`transfers` capability), used by `tests/unit/payouts.test.ts` to exercise `normaliseStripeAccount`
and `derivePayoutState` without the network.

They are transcribed from Stripe's documented responses and the states the pilot will meet, not
captured from a live platform account — Phase 7 had no Connect-enabled account to record from
(see PROGRESS.md). Replace them with `stripe accounts retrieve acct_…` output once one exists; the
fields the product reads are `details_submitted`, `payouts_enabled`, `charges_enabled`,
`business_type`, `requirements.*` and `external_accounts.data[0]`.
