export const PLAYGROUND_UPLOAD_MAX_BYTES = 6 * 1024 * 1024
export const PLAYGROUND_UPLOAD_RETENTION_MS = 24 * 60 * 60 * 1000

export function isPlaygroundEnabled(environment: string | undefined = process.env.NODE_ENV): boolean {
  return (environment ?? 'development') !== 'production'
}

export const PLAYGROUND_TABLE_SORT_FIELDS = [
  'available',
  'category',
  'color',
  'currency',
  'description',
  'id',
  'imageUrl',
  'imageUrl2',
  'inProduction',
  'open',
  'price',
  'productName',
  'quantity',
  'rating',
  'releaseDate',
  'status',
  'weight',
] as const

export type PlaygroundTableSortField = typeof PLAYGROUND_TABLE_SORT_FIELDS[number]
