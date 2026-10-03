import { requestClient } from '#/api/request';

export interface DictNode {
  children?: DictNode[];
  code: string;
  cacheEnabled: boolean;
  createTime: string;
  effectiveStatus: 0 | 1;
  hasChildren: boolean;
  id: string;
  name: string;
  order: number;
  pid: null | string;
  remark: null | string;
  status: 0 | 1;
  updateTime: string;
  value: null | string;
}
export interface DictWrite {
  code: string;
  cacheEnabled: boolean;
  name: string;
  order: number;
  pid: null | string;
  remark: null | string;
  value: null | string;
}
export interface DictQuery {
  enabledOnly?: boolean;
  format?: 'flat' | 'tree';
  includeSelf?: boolean;
}
/** 全量仅供字典管理显式操作，普通业务使用 /dict/:id/...。 */
export function getDictList(params: Pick<DictQuery, 'format'> = {}) {
  return requestClient.get<DictNode[]>('/system/dict/list', { params });
}
export function getDictRoots() {
  return requestClient.get<DictNode[]>('/system/dict/roots');
}
export function getDictChildren(id: string) {
  return requestClient.get<DictNode[]>(`/system/dict/${id}/children`);
}
export function getDict(id: string) {
  return requestClient.get<DictNode>(`/system/dict/${id}`);
}
export function getDictDescendants(id: string, params: DictQuery = {}) {
  return requestClient.get<DictNode[]>(`/system/dict/${id}/descendants`, {
    params,
  });
}
export function createDict(data: DictWrite) {
  return requestClient.post<DictNode>('/system/dict', data);
}
export function updateDict(id: string, data: Partial<Omit<DictWrite, 'code'>>) {
  return requestClient.put<boolean>(`/system/dict/${id}`, data);
}
export function setDictStatus(id: string, status: 0 | 1) {
  return requestClient.put<boolean>(`/system/dict/${id}/status`, { status });
}
