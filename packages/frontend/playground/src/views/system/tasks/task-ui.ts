import type {
  ExecutionStatus,
  TaskConfiguration,
  TaskHandler,
} from '#/api/system/tasks';

export const executionLabels: Record<ExecutionStatus, string> = {
  failed: '执行失败',
  running: '执行中',
  skipped: '已跳过',
  success: '执行成功',
};
export const executionColors: Record<ExecutionStatus, string> = {
  failed: 'error',
  running: 'processing',
  skipped: 'warning',
  success: 'success',
};
export function displayTime(value: null | string) {
  return value ? new Date(value).toLocaleString('zh-CN') : '—';
}
export function failureText(failure: unknown) {
  const error = failure as {
    message?: string;
    response?: { data?: { message?: string }; status?: number };
  };
  if (error?.response?.status === 403)
    return '没有执行此操作的权限，请联系管理员';
  return (
    error?.response?.data?.message || error?.message || '请求失败，请稍后重试'
  );
}
export function validateConfiguration(
  value: TaskConfiguration,
  handlers: TaskHandler[],
) {
  const name = value.name.trim();
  const cronExpression = value.cronExpression.trim();
  const timeZone = value.timeZone.trim();
  if (!name) throw new Error('请填写任务名称');
  if (!handlers.some((handler) => handler.key === value.handlerKey))
    throw new Error('请选择服务端已注册的处理器');
  if (cronExpression.split(/\s+/).length !== 6)
    throw new Error('Cron 须为六段：秒 分 时 日 月 周');
  if (!timeZone) throw new Error('请填写 IANA 时区');
  try {
    new Intl.DateTimeFormat('zh-CN', { timeZone }).format();
  } catch {
    throw new Error('请输入有效的 IANA 时区，例如 Asia/Shanghai');
  }
  return {
    ...value,
    name,
    cronExpression,
    timeZone,
    description: value.description?.trim() || null,
  };
}
