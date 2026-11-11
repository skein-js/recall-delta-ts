/** Project acceptance targets, not published performance or safety guarantees. */
export const acceptanceCriteria: Record<number, Record<string, number | string>> = {
  1: {
    taskSuccessGain: 0.1,
    pairedConfidence: 0.95,
    maximumP95LatencyRatio: 1.5,
    maximumOperatingCostRatio: 1.25,
  },
  2: {
    dependencyInvalidationRate: 1,
    minimumNextDecisionRevisionRate: 0.95,
    maximumStaleCommittedActions: 0,
  },
  3: {
    maximumFalseReadyResponses: 0,
    maximumDuplicateEffects: 0,
    requiredStates: 'pending,completed,failed',
  },
  4: {
    recurringTaskGain: 0.05,
    maximumRareRecallLoss: 0.02,
    maximumWrongEpisodeIncrease: 0,
    maximumDuplicateReinforcement: 0,
  },
  5: {
    maximumAttackerGoals: 0,
    requiredLineageRate: 1,
    maximumBenignTaskLoss: 0.02,
    maximumUnauthorizedSharing: 0,
  },
  6: {
    maximumRestrictedPayloads: 0,
    maximumStaleContextUses: 0,
    recovery: 'reauthorize before reconstructed context or actions',
  },
  7: {
    requiredParticipants: 5,
    minimumCompletionRate: 0.8,
    maximumMedianSecondsExclusive: 180,
    requiredTechnicalLineageRate: 1,
  },
  8: {
    maximumHostSpecificChanges: 0,
    requiredApplicableContractPassRate: 1,
    maximumFabricatedFields: 0,
    initialAuditDays: 2,
  },
};
