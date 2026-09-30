import { requestClient } from '#/api/request';

export interface TaskHandler {
  description: string;
  key: string;
  name: string;
}
export interface TaskConfiguration {
  cronExpression: string;
  description: null | string;
  enabled: boolean;
  handlerKey: string;
  name: string;
  timeZone: string;
}
export interface ScheduledTask extends TaskConfiguration {
  createdAt: string;
  id: string;
  updatedAt: string;
}
export type ExecutionStatus = 'failed' | 'running' | 'skipped' | 'success';
export interface TaskExecution {
  durationMs: null | number;
  errorCode: null | string;
  finishedAt: null | string;
  handlerKey: string;
  id: string;
  startedAt: string;
  status: ExecutionStatus;
  taskId: string;
  taskName: string;
  trigger: 'cron' | 'manual';
}
export interface TaskPage<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
export interface TaskQuery {
  enabled?: boolean;
  keyword?: string;
  page: number;
  pageSize: number;
}
export interface ExecutionQuery {
  page: number;
  pageSize: number;
  status?: ExecutionStatus;
}

const path = '/system/tasks';
const taskPath = (id: string) => `${path}/${encodeURIComponent(id)}`;
export const getTasks = (params: TaskQuery) =>
  requestClient.get<TaskPage<ScheduledTask>>(path, { params });
export const getTaskHandlers = () =>
  requestClient.get<TaskHandler[]>(`${path}/handlers`);
export const createTask = (data: TaskConfiguration) =>
  requestClient.post<ScheduledTask>(path, data);
export const updateTask = (id: string, data: TaskConfiguration) =>
  requestClient.request<ScheduledTask>(taskPath(id), { method: 'PATCH', data });
export const deleteTask = (id: string) => requestClient.delete(taskPath(id));
export const setTaskStatus = (id: string, enabled: boolean) =>
  requestClient.post<ScheduledTask>(`${taskPath(id)}/status`, { enabled });
export const runTask = (id: string) =>
  requestClient.post<TaskExecution>(`${taskPath(id)}/run`, {});
export const getTaskExecutions = (id: string, params: ExecutionQuery) =>
  requestClient.get<TaskPage<TaskExecution>>(`${taskPath(id)}/logs`, {
    params,
  });
export const getAllTaskExecutions = (params: ExecutionQuery) =>
  requestClient.get<TaskPage<TaskExecution>>(`${path}/logs`, { params });
