/** 向上追溯祖先路径；主键索引驱动，最多访问「层级」行。 */
export const dictAncestorPathSql = `
  WITH RECURSIVE chain AS (
    SELECT d.id, d.pid, d.name, 1 AS depth FROM sys_dict d
    WHERE d.id = $1::bigint AND d.deleted_at IS NULL
    UNION ALL
    SELECT p.id, p.pid, p.name, c.depth + 1 FROM sys_dict p JOIN chain c ON p.id = c.pid
    WHERE p.deleted_at IS NULL AND NOT p.id = ANY(ARRAY[c.id])
  )
  SELECT id::text, pid::text, depth::int FROM chain ORDER BY depth DESC
`

/**
 * 一次取出一级节点及其完整无限级子树。
 * 路径数组与祖先可用状态在同一次遍历内算出，读接口不再重复递归。
 */
export const dictTreeRowsSql = `
  WITH RECURSIVE tree AS (
    SELECT d.*, ARRAY[d.id] AS path_ids, ARRAY[d.name::text] AS path_names, d.status = 1 AS enabled
    FROM sys_dict d
    WHERE d.id = $1::bigint AND d.deleted_at IS NULL
    UNION ALL
    SELECT d.*, t.path_ids || d.id, t.path_names || d.name::text, t.enabled AND d.status = 1
    FROM sys_dict d JOIN tree t ON d.pid = t.id
    WHERE d.deleted_at IS NULL AND NOT d.id = ANY(t.path_ids)
  )
  SELECT t.id::text, t.pid::text, t.name, t.code, t.value, t.status, t.order_no AS "order", t.remark,
    t.created_at AS "createTime", t.updated_at AS "updateTime",
    t.path_ids::text[] AS "pathIds", t.path_names AS "pathNames"
  FROM tree t
  ORDER BY t.path_ids
`
