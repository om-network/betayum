import 'reflect-metadata';
import { PERMISSIONS_KEY } from '../../auth/permission.guard';
import { AutomationsController } from './automations.controller';

jest.mock('@db', () => ({
  db: {},
  TaskFrequency: {
    daily: 'daily',
    weekly: 'weekly',
    monthly: 'monthly',
    quarterly: 'quarterly',
    yearly: 'yearly',
  },
}));

jest.mock('../../auth/auth.server', () => ({
  auth: { api: { getSession: jest.fn() } },
}));

jest.mock('@trycompai/auth', () => ({
  statement: {
    task: ['create', 'read', 'update', 'delete'],
  },
  BUILT_IN_ROLE_PERMISSIONS: {},
}));

jest.mock('../tasks.service', () => ({
  TasksService: class TasksService {},
}));

describe('AutomationsController permissions', () => {
  it('uses task:update for creating and deleting task automations', () => {
    const createPermission = Reflect.getMetadata(
      PERMISSIONS_KEY,
      AutomationsController.prototype.createAutomation,
    );
    const deletePermission = Reflect.getMetadata(
      PERMISSIONS_KEY,
      AutomationsController.prototype.deleteAutomation,
    );

    expect(createPermission).toEqual([
      { resource: 'task', actions: ['update'] },
    ]);
    expect(deletePermission).toEqual([
      { resource: 'task', actions: ['update'] },
    ]);
  });
});
