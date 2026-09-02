/**
 * Shared scoring rules, so every surface that shows a point total agrees.
 *
 * Submissions are already scoped by looking up the linked Task/Flashcard and
 * checking its batch_id. Manual awards had no such link: every award a member
 * ever received counted toward whatever batch they are in now, which let points
 * from a previous cohort leak into a new batch's leaderboard.
 */

/** Start date of a batch, read from its CONFIG_BATCH row in the Flashcards table. */
export const getBatchStart = (allFlashcards: any[], batchId: any): Date | null => {
    const cfg = (allFlashcards || []).find((f: any) =>
        (f.partitionKey === 'CONFIG_BATCH' || f.PartitionKey === 'CONFIG_BATCH') &&
        (f.rowKey || f.RowKey) === batchId
    );
    const raw = cfg?.start_date || cfg?.StartDate || cfg?.startDate;
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
};

/**
 * Does this manual award count toward `batchId`?
 *
 * Awards written since batch_id was recorded carry it, and must match exactly.
 * Older awards have none — for those fall back to "was it granted on or after
 * this batch started", comparing calendar dates the way the rest of the app does.
 * With no known start date we count it, so a missing config never silently
 * zeroes out somebody's legitimate score.
 */
export const awardBelongsToBatch = (award: any, batchId: any, batchStart: Date | null): boolean => {
    const aBatch = award?.batch_id || award?.BatchId;
    if (aBatch) return aBatch === batchId;
    if (!batchStart) return true;
    const startOfDay = new Date(batchStart.getFullYear(), batchStart.getMonth(), batchStart.getDate());
    const created = new Date(award?.created_at || award?.Timestamp || 0);
    return !isNaN(created.getTime()) && created.getTime() >= startOfDay.getTime();
};

/**
 * Points actually earned by a submission. Only an approved submission scores —
 * a pending or retry one is worth nothing yet, even though its task defines a
 * point value.
 */
export const submissionPoints = (status: string | undefined, taskOrCardPoints: any): number =>
    status === 'approved' ? (Number(taskOrCardPoints) || 0) : 0;
