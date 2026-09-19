import { randomUUID } from 'node:crypto'
import { ApiProperty } from '@nestjs/swagger'
import { IsString } from 'class-validator'
import { ResOp } from '#/common/dto/response.dto.js'

export class WsMessagePayload {
  @ApiProperty()
  content: string
}

export class WsEmitResponse<T> {
  @ApiProperty({ description: '事件' })
  event: string

  @ApiProperty({ description: '事件返回数据' })
  data: T
}

export class WsBroadcastPayload {
  @ApiProperty()
  content: string
}

export class WsPingResponse {
  @ApiProperty()
  timestamp: string
}

export class WsResOp extends ResOp {
}

export class JoinRoomDto {
  @ApiProperty()
  @IsString()
  room_id: string
}

export class LeaveRoomDto {
  @ApiProperty()
  room_id: string
}

export class JoinRoomResDto extends WsEmitResponse<JoinRoomDto> {
  @ApiProperty({ example: 'joined' })
  declare event: string

  @ApiProperty({ type: () => JoinRoomDto })
  declare data: JoinRoomDto
}
