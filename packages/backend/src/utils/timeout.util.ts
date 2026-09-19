// src/common/utils/timeout.util.ts

/**
 * 用 Promise.race 给任意 Promise 加超时限制。
 * 超时后 reject TimeoutError，并自动清理定时器（避免内存泄漏）。
 */
export interface TimeoutResult<T> {
  data: T
  elapsedMs: number
  isTimedOut: false
}

export interface TimeoutFallback {
  data: null
  elapsedMs: number
  isTimedOut: true
}

export type WithTimeoutResult<T> = TimeoutResult<T> | TimeoutFallback

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<WithTimeoutResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const startTime = performance.now()

  const wrappedPromise = promise.then(
    (value): TimeoutResult<T> => {
      clearTimeout(timer)//  在 resolve 的同一个微任务里清理定时器避免存活内存泄露
      return {
        data: value,
        elapsedMs: Math.round(performance.now() - startTime),
        isTimedOut: false,
      }
    },
    (err) => {
      clearTimeout(timer)//  在 reject 的同一个微任务里清理定时器避免存活内存泄露
      throw err
    },
  )

  const timeoutPromise = new Promise<TimeoutFallback>((resolve) => {
    timer = setTimeout(() => {
      resolve({
        data: null,
        elapsedMs: timeoutMs,
        isTimedOut: true,
      })
    }, timeoutMs)
  })

  return Promise.race([wrappedPromise, timeoutPromise])
}
