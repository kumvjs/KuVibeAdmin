// Matching Redis hash tags allow atomic multi-key operations on a cluster.
export const uploadKeys = {
  policy: (purpose: string): string => `upload:policy:{${purpose}}:value`,
  policyGeneration: (purpose: string): string => `upload:policy:{${purpose}}:generation`,
} as const
