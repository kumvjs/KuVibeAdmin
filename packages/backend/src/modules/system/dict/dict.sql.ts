import { DICT_MAX_DEPTH, DICT_MAX_RESULT_NODES } from './dict.types.js'

export function dictColumns(alias: string) {
  return `
  ${alias}.id::text AS id, ${alias}.pid::text AS pid, ${alias}.name, ${alias}.code,
  ${alias}.value, ${alias}.status, ${alias}.order_no AS "order", ${alias}.remark,
  ${alias}.cache_enabled AS "cacheEnabled", ${alias}.created_at AS "createTime", ${alias}.updated_at AS "updateTime",
  EXISTS (SELECT 1 FROM sys_dict c WHERE c.pid = ${alias}.id AND c.deleted_at IS NULL) AS "hasChildren"`
}

/** 只沿主键追溯锚点祖先，不加载祖先的任何兄弟/下级。 */
export const dictChainCte = `
  WITH RECURSIVE chain AS (
    SELECT d.*, ARRAY[d.id] AS visited FROM sys_dict d WHERE d.id = $1::bigint AND d.deleted_at IS NULL
    UNION ALL
    SELECT p.*, c.visited || p.id FROM sys_dict p JOIN chain c ON p.id = c.pid
    WHERE p.deleted_at IS NULL AND NOT p.id = ANY(c.visited) AND cardinality(c.visited) <= ${DICT_MAX_DEPTH}
  ), anchor AS (
    SELECT d.*, (SELECT bool_and(c.status = 1) FROM chain c) AS enabled,
      EXISTS (SELECT 1 FROM chain c WHERE c.pid IS NULL) AS valid
    FROM sys_dict d WHERE d.id = $1::bigint AND d.deleted_at IS NULL
  )`

/** 直接下级始终为 pid 索引查询；祖先 CTE 仅校验有效状态与异常链。 */
export const dictChildrenSql = `${dictChainCte}, selected AS (
  SELECT ${dictColumns('d')}, CASE WHEN a.enabled AND d.status = 1 THEN 1 ELSE 0 END AS "effectiveStatus"
  FROM sys_dict d CROSS JOIN anchor a
  WHERE d.pid = a.id AND d.deleted_at IS NULL AND (NOT $2::boolean OR (a.enabled AND d.status = 1))
  ORDER BY d.order_no, d.id LIMIT ${DICT_MAX_RESULT_NODES + 1}
)
SELECT a.cache_enabled AS "cacheEnabled", a.valid, (SELECT max(cardinality(c.visited)) FROM chain c) > ${DICT_MAX_DEPTH} AS "tooDeep",
  COALESCE((SELECT jsonb_agg(s) FROM selected s), '[]'::jsonb) AS rows
FROM anchor a`

export const dictDescendantsSql = `${dictChainCte}, tree AS (
  SELECT a.*, ARRAY[a.id] AS ids, (SELECT max(cardinality(c.visited)) FROM chain c) AS depth FROM anchor a
  UNION ALL
  SELECT d.*, t.enabled AND d.status = 1, t.valid, t.ids || d.id, t.depth + 1
  FROM sys_dict d JOIN tree t ON d.pid = t.id
  WHERE d.deleted_at IS NULL AND NOT d.id = ANY(t.ids) AND t.depth <= ${DICT_MAX_DEPTH}
    AND (NOT $2::boolean OR (t.enabled AND d.status = 1))
), selected AS (
  SELECT ${dictColumns('t')}, CASE WHEN t.enabled THEN 1 ELSE 0 END AS "effectiveStatus"
  FROM tree t WHERE (t.id <> $1::bigint OR $3::boolean) AND (NOT $2::boolean OR t.enabled)
  ORDER BY t.order_no, t.id LIMIT ${DICT_MAX_RESULT_NODES + 1}
)
SELECT a.cache_enabled AS "cacheEnabled", a.valid,
  EXISTS (SELECT 1 FROM tree WHERE depth > ${DICT_MAX_DEPTH}) AS "tooDeep",
  COALESCE((SELECT jsonb_agg(s) FROM selected s), '[]'::jsonb) AS rows
FROM anchor a`
