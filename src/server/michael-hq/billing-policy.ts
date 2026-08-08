// Hard billing doctrine for Michael HQ — pure constants, no I/O.

/** Always zero — revenue share / 20% commission is forbidden. */
export const REVENUE_SHARE_PERCENT = 0 as const;

/** Usage-only infrastructure billing — never a cut of user project revenue. */
export const BILLING_MODEL = "usage_only_no_revenue_share" as const;
