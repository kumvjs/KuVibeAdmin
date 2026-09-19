import { WS_NS } from '../ws-ns.constants.js'

export * from './uid.keys.js'

export type NominalWsRoomKey<T extends string> = string & { readonly __wsRoomKeyBrand: T }

export type WsRoomKey = NominalWsRoomKey<string>

const WS_ROOM_KEY_PREFIX = 'wsRoom' as const

export const wsRoomKeyGen = (roomId: string): WsRoomKey => `${WS_ROOM_KEY_PREFIX}:${roomId}` as WsRoomKey
