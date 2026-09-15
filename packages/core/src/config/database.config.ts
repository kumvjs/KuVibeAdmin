import { ConfigType, registerAs } from '@nestjs/config'
import { config } from 'dotenv'
import { DataSource, DataSourceOptions } from 'typeorm'

config({ path: `.env.${process.env.NODE_ENV}` })
export const dbRegToken = 'database'
export const dataSourceOptions: DataSourceOptions = {
  type: process.env.TYPEORM_TYPE as any,
  host: process.env.TYPEORM_HOST,
  port: Number(process.env.TYPEORM_PORT),
  username: process.env.TYPEORM_USERNAME,
  password: process.env.TYPEORM_PASSWORD,
  database: process.env.TYPEORM_DATABASE,
  // 空字符串会让 TypeORM 查询空 schema，无法识别已存在的表。
  schema: process.env.TYPEORM_SCHEMA?.trim() || undefined,
  synchronize: process.env.TYPEORM_SYNCHRONIZE === 'true',
  entities: ['dist/**/*.entity{.js,.ts}'],
  migrations: ['dist/src/migrations/*{.js,.ts}'],
}
// console.log(dataSourceOptions)
export const databaseConfig = registerAs(
  dbRegToken,
  (): DataSourceOptions => dataSourceOptions,
)
export type DatabaseConfig = ConfigType<typeof databaseConfig>

const dataSource = new DataSource(dataSourceOptions)

export default dataSource
