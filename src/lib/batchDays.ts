// Challenge length per batch. Stored on the CONFIG_BATCH row as `total_days`.
// Batches created before this setting existed have no value and stay 21 days.
// The client (Client dashboard/src/App.jsx) reads the same field with the same default.
export const DEFAULT_TOTAL_DAYS = 21;
export const DURATION_PRESETS = [10, 21];
export const MAX_TOTAL_DAYS = 60;

export const getBatchTotalDays = (batch: any): number => {
    const n = Number(batch?.total_days ?? batch?.TotalDays);
    return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), MAX_TOTAL_DAYS) : DEFAULT_TOTAL_DAYS;
};

// Days after the last challenge day that still count as "in the challenge" for the
// day counter (the original 21-day app clamped to 28, i.e. one extra week).
export const GRACE_DAYS = 7;
