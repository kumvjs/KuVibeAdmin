import type { PlaygroundTableItemDto } from './dto/playground.dto.js'

const IMAGE_URL = 'https://unpkg.com/@vbenjs/static-source@0.1.7/source/logo-v1.webp'
const CATEGORIES = ['Books', 'Electronics', 'Home', 'Office'] as const
const COLORS = ['blue', 'green', 'orange', 'purple'] as const
const CURRENCIES = ['CNY', 'EUR', 'JPY', 'USD'] as const
const STATUSES = ['success', 'error', 'warning'] as const

export const PLAYGROUND_TABLE_FIXTURES: readonly PlaygroundTableItemDto[] = Object.freeze(
  Array.from({ length: 100 }, (_, index): PlaygroundTableItemDto => {
    const number = index + 1
    return Object.freeze({
      available: number % 3 !== 0,
      category: CATEGORIES[index % CATEGORIES.length],
      color: COLORS[index % COLORS.length],
      currency: CURRENCIES[index % CURRENCIES.length],
      description: `Deterministic playground product ${number}`,
      id: `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`,
      imageUrl: IMAGE_URL,
      imageUrl2: IMAGE_URL,
      inProduction: number % 5 !== 0,
      open: number % 2 === 0,
      price: (10 + number * 1.25).toFixed(2),
      productName: `Demo Product ${String(number).padStart(3, '0')}`,
      quantity: (number * 17) % 100 + 1,
      rating: Number((1 + (number % 40) / 10).toFixed(1)),
      releaseDate: new Date(Date.UTC(2020 + (index % 5), index % 12, (index % 28) + 1)).toISOString(),
      status: STATUSES[index % STATUSES.length],
      tags: [`demo-${number % 3}`, `fixture-${number % 5}`, `item-${number}`],
      weight: Number((0.1 + (number % 90) / 10).toFixed(1)),
    })
  }),
)

export const PLAYGROUND_BIGINT_RESPONSE = `{"code":0,"data":[{"id":123456789012345678901234567890123456789012345678901234567890,"name":"John Doe","age":30,"email":"john-doe@demo.com"},{"id":987654321098765432109876543210987654321098765432109876543210,"name":"Jane Smith","age":25,"email":"jane@demo.com"}],"message":"success","success":true,"traceId":""}`
