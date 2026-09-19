export const WS_NS = {
  CHAT: 'chat',
  LIVE_ROOM: 'live-room',
} as const
export type WS_NS_Type = typeof WS_NS[keyof typeof WS_NS]
