import 'fastify'
import '@fastify/cookie'

declare module 'fastify' {
  interface FastifyRequest {
    user?: SysUserEntity
    accessToken: string
  }
}

declare module 'socket.io' {
  interface Socket {
    user?: LoginUserContext
  }
}
