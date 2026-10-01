import { requestClient } from '#/api/request';

export interface DictNode {
  children?: DictNode[];
  code: string;
  createTime: string;
  depth: number;
  effectiveStatus: 0 | 1;
  fullPathId: string;
  fullPathName: string;
  hasChildren: boolean;
  id: string;
  name: string;
  order: number;
  pathIds: string[];
  pathNames: string[];
  pid: null | string;
  remark: null | string;
  status: 0 | 1;
  updateTime: string;
  value: null | string;
}

export interface DictWrite {
  code: string;
  name: string;
  order: number;
  pid: null | string;
  remark: null | string;
  status: 0 | 1;
  value: null | string;
}

export interface DictQuery {
  enabledOnly?: boolean;
  format?: 'flat' | 'tree';
  includeSelf?: boolean;
  rootCode?: string;
  rootId?: string;
}

export function getDictList(params: DictQuery = {}) {
  return requestClient.get<DictNode[]>('/system/dict/list', { params });
}

export function getDict(id: string) {
  return requestClient.get<DictNode>(`/system/dict/${id}`);
}

export function getDictDescendants(
  id: string,
  params: Omit<DictQuery, 'rootCode' | 'rootId'> = {},
) {
  return requestClient.get<DictNode[]>(`/system/dict/${id}/descendants`, {
    params,
  });
}

export function createDict(data: DictWrite) {
  return requestClient.post<DictNode>('/system/dict', data);
}

export function updateDict(id: string, data: Partial<DictWrite>) {
  return requestClient.put<boolean>(`/system/dict/${id}`, data);
}

export function deleteDict(id: string) {
  return requestClient.delete<boolean>(`/system/dict/${id}`);
}
