import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { defineConfig } from '@hey-api/openapi-ts';

// tag 中的英文优先；纯中文 tag 取同组 operationId 的公共前缀作为 ASCII 文件名。
function asciiSlug(value: string): string {
  return value.normalize('NFKD')
    .replace(/([a-z\d])([A-Z])/g, '$1-$2')
    .replace(/[^a-z\d]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function tagSlug(tag: string, ids: string[]): string {
  const fromTag = asciiSlug(tag);
  if (fromTag) return fromTag;
  const prefix = ids.reduce((common, id) => {
    let index = 0;
    while (index < common.length && common[index] === id[index]) index++;
    return common.slice(0, index);
  }, ids[0] ?? '');
  return asciiSlug(prefix) || `tag-${createHash('sha256').update(tag).digest('hex').slice(0, 8)}`;
}

const input = fileURLToPath(new URL('../../backend/openapi/openapi.json', import.meta.url));
const document = JSON.parse(readFileSync(input, 'utf8')) as {
  paths: Record<string, Record<string, { operationId?: string; tags?: string[] }>>;
};
const operationIds = new Set<string>();
const tagOperations = new Map<string, string[]>();
for (const [path, methods] of Object.entries(document.paths)) {
  for (const operation of Object.values(methods)) {
    if (!operation.operationId) continue;
    if (operationIds.has(operation.operationId)) {
      throw new Error(`OpenAPI operationId 重复：${operation.operationId}（${path}）`);
    }
    operationIds.add(operation.operationId);
    for (const tag of operation.tags ?? []) {
      const ids = tagOperations.get(tag) ?? [];
      ids.push(operation.operationId);
      tagOperations.set(tag, ids);
    }
  }
}

// 不同 tag 可能清理成同一文件名；仅对冲突项追加稳定哈希。
const groups = new Map<string, string>();
const slugCounts = new Map<string, number>();
for (const [tag, ids] of tagOperations) {
  const slug = tagSlug(tag, ids);
  slugCounts.set(slug, (slugCounts.get(slug) ?? 0) + 1);
}
for (const [tag, ids] of tagOperations) {
  const slug = tagSlug(tag, ids);
  const suffix = slugCounts.get(slug)! > 1
    ? `-${createHash('sha256').update(tag).digest('hex').slice(0, 8)}`
    : '';
  groups.set(tag, `${slug}${suffix}`);
}
if (new Set(groups.values()).size !== groups.size) {
  throw new Error('OpenAPI tag 文件名冲突');
}

export default defineConfig({
  parser: {
    hooks: {
      symbols: {
        getFilePath: (symbol) => {
          const tags = symbol.meta?.tags;
          const tag = Array.isArray(tags) && typeof tags[0] === 'string' ? tags[0] : undefined;
          if (tag) {
            const group = groups.get(tag);
            if (!group) throw new Error(`OpenAPI tag 不在契约中: ${tag}`);
            if (symbol.kind === 'var' || symbol.kind === 'function') return `services/${group}`;
            if (symbol.kind === 'type' || symbol.kind === 'interface' || symbol.kind === 'enum') return `types/${group}`;
            return undefined;
          }
          // 无 tag 的公共 DTO/Entity 独立存放；其他基础设施符号沿用生成器默认路径。
          if (symbol.kind === 'type' && symbol.meta?.resource === 'definition' && Array.isArray(symbol.meta?.path) && symbol.meta.path[0] === 'components' && symbol.meta.path[1] === 'schemas') return `models/${symbol.name}`;
          return undefined;
        },
      },
    },
  },
  input,
  output: 'src/services/generated',
  plugins: [
    '@hey-api/typescript',
    { name: '@hey-api/sdk', operations: { strategy: 'flat' } },
    {
      name: '@hey-api/client-axios',
      runtimeConfigPath: './src/services/runtime',
      throwOnError: true,
    },
  ],
});
