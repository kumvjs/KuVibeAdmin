import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import { IsBoolean, IsIn, IsInt, IsString, Length, Matches, Max, Min, ValidateBy, ValidateIf } from 'class-validator'

export class TaskIdDto {
  @ApiProperty({ type: String })
  @Matches(/^[1-9]\d{0,9}$/)
  @ValidateBy({ name: 'taskIdRange', validator: { validate: value => typeof value === 'string' && /^[1-9]\d{0,9}$/.test(value) && BigInt(value) < 2147483647n, defaultMessage: () => '任务 ID 超出支持范围' } })
  id: string
}
export class TaskWriteDto {
  @ApiProperty() @IsString() @Length(1, 100) name: string
  @ApiProperty() @IsString() @Length(1, 100) handlerKey: string
  @ApiProperty({ example: '*/5 * * * * *' }) @IsString() @Length(1, 100) cronExpression: string
  @ApiProperty({ example: 'Asia/Shanghai' }) @IsString() @Length(1, 100) timeZone: string
  @ApiProperty() @IsBoolean() enabled: boolean
  @ApiPropertyOptional({ nullable: true, type: String })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString() @Length(0, 500) description?: string | null
}
export class TaskStatusDto {
  @ApiProperty() @IsBoolean() enabled: boolean
}
export class TaskPageQueryDto {
  @ApiPropertyOptional({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1
  @ApiPropertyOptional({ default: 20 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20
}
export class TaskQueryDto extends TaskPageQueryDto {
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsString() @Length(0, 100) keyword?: string
  @ApiPropertyOptional({ type: Boolean })
  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value)
  @ValidateIf((_object, value) => value !== undefined) @IsBoolean() enabled?: boolean
}
export class TaskLogQueryDto extends TaskPageQueryDto {
  @ApiPropertyOptional({ enum: ['running', 'success', 'failed', 'skipped'] })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['running', 'success', 'failed', 'skipped']) status?: string
}
export class TaskResponseDto {
  @ApiProperty() id: string
  @ApiProperty() name: string
  @ApiProperty() handlerKey: string
  @ApiProperty() cronExpression: string
  @ApiProperty() timeZone: string
  @ApiProperty() enabled: boolean
  @ApiProperty({ type: String, nullable: true }) description: string | null
  @ApiProperty() createdAt: string
  @ApiProperty() updatedAt: string
}
export class TaskHandlerDto {
  @ApiProperty() key: string
  @ApiProperty() name: string
  @ApiProperty() description: string
}
export class TaskExecutionDto {
  @ApiProperty() id: string
  @ApiProperty() taskId: string
  @ApiProperty() taskName: string
  @ApiProperty() handlerKey: string
  @ApiProperty({ enum: ['cron', 'manual'] }) trigger: string
  @ApiProperty({ enum: ['running', 'success', 'failed', 'skipped'] }) status: string
  @ApiProperty() startedAt: string
  @ApiProperty({ type: String, nullable: true }) finishedAt: string | null
  @ApiProperty({ type: Number, nullable: true }) durationMs: number | null
  @ApiProperty({ type: String, nullable: true }) errorCode: string | null
}
export class TaskPageDto {
  @ApiProperty({ type: [TaskResponseDto] }) items: TaskResponseDto[]
  @ApiProperty() total: number
  @ApiProperty() page: number
  @ApiProperty() pageSize: number
}
export class TaskLogPageDto {
  @ApiProperty({ type: [TaskExecutionDto] }) items: TaskExecutionDto[]
  @ApiProperty() total: number
  @ApiProperty() page: number
  @ApiProperty() pageSize: number
}
