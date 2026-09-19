/** DTO 类可能初始化未提交的字段为 undefined；null 仍表示显式提交。 */
export function hasSubmittedField(value: object, key: PropertyKey): boolean {
  return Object.hasOwn(value, key) && Reflect.get(value, key) !== undefined
}
