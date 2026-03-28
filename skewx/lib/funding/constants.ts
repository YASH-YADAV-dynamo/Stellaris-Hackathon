/** Rates with |rate| below this are treated as neutral for pills (hourly decimal) */
export const FUNDING_RATE_DEADBAND = 1e-7;

/** Default funding period when API does not specify (1h) */
export const ONE_HOUR_MS = 3_600_000;

/** Reference notional (USD) for any $-scaled helpers; funding UI uses API rate / paymentDisplay. */
export const FUNDING_NOTIONAL_USD = 25_000;
