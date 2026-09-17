import { registerDecorator, ValidationOptions } from 'class-validator'
import { isIanaTimezone } from '#/utils/time.util.js'

export function IsIanaTimezone(validationOptions?: ValidationOptions): PropertyDecorator {
  return (object, propertyName) => registerDecorator({
    name: 'isIanaTimezone',
    target: object.constructor,
    propertyName: propertyName.toString(),
    options: validationOptions,
    validator: {
      validate: isIanaTimezone,
      defaultMessage: () => 'timezone 必须是有效的 IANA 时区',
    },
  })
}
