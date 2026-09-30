import { expect, it } from 'vitest';

import {
  failureText,
  validateConfiguration,
} from '#/views/system/tasks/task-ui';

const handlers = [
  { key: 'attachments.cleanup', name: '清理', description: '' },
];
const valid = {
  name: '清理任务',
  handlerKey: 'attachments.cleanup',
  cronExpression: '0 * * * * *',
  timeZone: 'Asia/Shanghai',
  enabled: false,
  description: null,
};
it('拒绝未知处理器、五段 Cron 和无效 IANA 时区，服务端继续校验完整 Cron', () => {
  expect(() =>
    validateConfiguration({ ...valid, handlerKey: 'shell' }, handlers),
  ).toThrow('已注册');
  expect(() =>
    validateConfiguration({ ...valid, cronExpression: '* * * * *' }, handlers),
  ).toThrow('六段');
  expect(() =>
    validateConfiguration({ ...valid, timeZone: 'invalid/timezone' }, handlers),
  ).toThrow('IANA');
  expect(
    validateConfiguration({ ...valid, description: ' ' }, handlers).description,
  ).toBeNull();
});
it('权限失败显示明确提示，不展示伪造的运行成功', () => {
  expect(failureText({ response: { status: 403 } })).toContain('权限');
});
