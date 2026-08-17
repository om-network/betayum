import 'reflect-metadata';

jest.mock('@trycompai/auth', () => ({
  statement: { task: ['read'] },
  BUILT_IN_ROLE_PERMISSIONS: {},
}));
jest.mock('../../auth/auth.server', () => ({
  auth: { api: { getSession: jest.fn() } },
}));
jest.mock('../../auth/hybrid-auth.guard', () => ({
  HybridAuthGuard: class HybridAuthGuard {},
}));
jest.mock('../tasks.service', () => ({ TasksService: class TasksService {} }));
jest.mock('./automation-context.service', () => ({
  AutomationContextService: class AutomationContextService {},
}));

import { PERMISSIONS_KEY } from '../../auth/permission.guard';
import { AutomationContextController } from './automation-context.controller';

describe(`${AutomationContextController.name} permissions`, () => {
  it('requires task:read for context and attachment extraction', () => {
    const getContext = Object.getOwnPropertyDescriptor(
      AutomationContextController.prototype,
      'getContext',
    )?.value as unknown;
    const extractAttachment = Object.getOwnPropertyDescriptor(
      AutomationContextController.prototype,
      'extractAttachment',
    )?.value as unknown;
    if (
      typeof getContext !== 'function' ||
      typeof extractAttachment !== 'function'
    ) {
      throw new Error('Expected controller methods to exist');
    }
    expect(Reflect.getMetadata(PERMISSIONS_KEY, getContext)).toEqual([
      { resource: 'task', actions: ['read'] },
    ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, extractAttachment)).toEqual([
      { resource: 'task', actions: ['read'] },
    ]);
  });
});
