import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DataSource, LoggerOptions } from 'typeorm'
import { DatabaseConfig } from '#/config/index.js'
import { databaseConfig } from '#/config/database.config.js'
import { TypeORMLogger } from './typeorm-logger.js'
import { AuditSubscriber } from './subscribers/audit.subscriber.js'

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [databaseConfig.KEY],
      useFactory: (db: DatabaseConfig) => {
        console.error('[DB] config factory', { type: db.type })
        let loggerOptions: LoggerOptions = process.env.DB_LOGGING as 'all'

        try {
          // 解析成 js 数组 ['error']
          loggerOptions = JSON.parse(loggerOptions)
        }
        catch {
          // ignore
        }

        return {
          ...db,
          autoLoadEntities: true,
          logging: loggerOptions,
          logger: new TypeORMLogger(loggerOptions),
        }
      },
      // dataSource receives the configured DataSourceOptions
      // and returns a Promise<DataSource>.
      dataSourceFactory: async (options) => {
        console.error('[DB] before initialize')
        if (!options) {
          throw new Error('DataSourceOptions is required to initialize DataSource')
        }
        const dataSource = await new DataSource(options).initialize()
        console.error('[DB] after initialize')
        return dataSource
      },
    }),
  ],
  providers: [AuditSubscriber]
})
export class DatabaseModule { }
