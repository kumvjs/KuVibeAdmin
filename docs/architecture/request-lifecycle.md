# 请求处理链路

装饰器、动态 Body 管道、DTO 与异常的使用示例见 [内置公共能力](/reference/common)。

## HTTP 链路

```text
Fastify onRequest hook
  → TraceMiddleware
  → TrustedOriginGuard
  → JwtAuthGuard
  → RbacGuard
  → ValidationPipe
  → Controller / Service
  → ClassSerializerInterceptor
  → TransformInterceptor
  → 统一响应
```

任意阶段抛出的异常由 `CatchEverythingFilter` 处理。请求头中的 `x-trace-id` 或 `x-request-id` 会被复用，否则生成 UUID，并写回 `x-trace-id` 响应头。

`TrustedOriginGuard` 仅处理 HTTP：GET/HEAD/OPTIONS 直接通过；带可信 Origin 的写请求通过；带非白名单 Origin 的写请求在认证和业务逻辑前返回 HTTP 403。没有 Origin 的 CLI/服务间调用继续可用。WebSocket 不经过该 Guard，握手与消息仍使用各自的 JWT/RBAC 链路。

### 全局参数校验

`ValidationPipe` 开启 `transform` 与 `whitelist`：DTO 类型会被转换，未声明字段会被剔除；首个校验错误以 HTTP 422 返回。

### 统一成功响应

```json
{
  "code": 0,
  "data": {},
  "message": "success",
  "success": true,
  "traceId": "8d4f..."
}
```

控制器若返回 `undefined`，`data` 会变为 `null`。需要返回文件、流或自定义响应时，可使用 `@SkipResponseTransform()` 跳过封装。

### 统一失败响应

```json
{
  "code": 10004,
  "data": null,
  "message": "无权限",
  "errors": ["无权限"],
  "success": false,
  "traceId": "8d4f..."
}
```

业务错误码与 HTTP 状态码是两个维度。例如无权限业务码为 `10004`，HTTP 状态为 403。

## WebSocket 消息链路

具体 Gateway 继承 `BaseRbacGateway` 后，消息处理器会复用 `JwtAuthGuard`、`RbacGuard` 和统一异常过滤器；`WsInterceptor` 为每条消息创建 trace 上下文，并把处理器结果主动 emit 给当前客户端。

```text
Socket.IO handshake → BaseRbacGateway.handleConnection
消息 → JWT Guard → RBAC Guard → handler
    → WsInterceptor → client.emit(event, WsResOp)
异常 → client.emit('error', ResOp)
```

WebSocket 详细约定见 [WebSocket 模块](/modules/websocket)。
