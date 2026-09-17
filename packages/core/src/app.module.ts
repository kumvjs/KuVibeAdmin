import { ClassSerializerInterceptor, MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { CatchEverythingFilter } from './common/filters/catch-everything.filter.js'
import { TransformInterceptor } from './common/interceptors/transform.interceptor.js'
import { TraceMiddleware } from './common/middleware/trace.middleware.js'
import { envValidationSchema } from './config/env.validation.js'
import config from './config/index.js'
import { AiModule } from './modules/ai/ai.module.js'
import { AuthModule } from './modules/auth/auth.module.js'
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard.js'
import { RbacGuard } from './modules/auth/guards/rbac.guard.js'
import { TrustedOriginGuard } from './modules/auth/guards/trusted-origin.guard.js'
import { isPlaygroundEnabled } from './modules/playground/playground.constants.js'
import { PlaygroundModule } from './modules/playground/playground.module.js'
import { SystemModule } from './modules/system/system.module.js'
import { TimezoneModule } from './modules/timezone/timezone.module.js'
import { UploadModule } from './modules/upload/upload.module.js'
import { UserModule } from './modules/user/user.module.js'
import { WebsocketModule } from './modules/websocket/websocket.module.js'
import { DatabaseModule } from './shared/database/database.module.js'
import { SharedModule } from './shared/shared.module.js'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      expandVariables: true,
      envFilePath: [`.env.${process.env.NODE_ENV || 'development'}`, '.env'],
      validationSchema: envValidationSchema,
      load: [...Object.values(config)],
    }),
    SharedModule,
    DatabaseModule,
    AuthModule,
    UserModule,
    TimezoneModule,
    AiModule,
    SystemModule,
    UploadModule,
    ...(isPlaygroundEnabled() ? [PlaygroundModule] : []),
    WebsocketModule,
  ],
  controllers: [],
  providers: [
    { provide: APP_FILTER, useClass: CatchEverythingFilter },

    { provide: APP_INTERCEPTOR, useClass: ClassSerializerInterceptor },

    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },

    { provide: APP_GUARD, useClass: TrustedOriginGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RbacGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TraceMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL }) // 全局生效
  }
}
