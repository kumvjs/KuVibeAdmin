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
