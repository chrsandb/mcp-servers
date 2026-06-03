jest.mock('@chkp/mcp-utils', () => ({
  SessionContext: {
    getAPIManager: jest.fn(),
  },
}));

jest.mock('@chkp/quantum-infra', () => ({
  assertNoRawPayloadConflicts: (args: Record<string, unknown>, protectedKeys: Record<string, string> | string[]) => {
    const raw = args.raw_payload as Record<string, unknown> | undefined;
    if (!raw) return;
    const keyMap = Array.isArray(protectedKeys)
      ? Object.fromEntries(protectedKeys.map((key) => [key, key]))
      : protectedKeys;
    for (const [argKey, rawKey] of Object.entries(keyMap)) {
      if (args[argKey] !== undefined && rawKey in raw) {
        throw new Error(`raw_payload must not override ${rawKey}`);
      }
    }
  },
  assertWriteCommand: (command: string, options?: { allowInstallPolicy?: boolean; allowDelete?: boolean }) => {
    const normalized = command.trim().toLowerCase();
    if (!/^[a-z][a-z0-9-]*$/.test(normalized)) {
      throw new Error('Command must contain only lowercase letters, digits, and hyphens');
    }
    if (
      ['publish', 'discard'].includes(normalized) ||
      normalized.startsWith('add-') ||
      normalized.startsWith('set-') ||
      (options?.allowDelete !== false && normalized.startsWith('delete-'))
    ) {
      return normalized;
    }
    if (options?.allowInstallPolicy && normalized === 'install-policy') {
      return normalized;
    }
    throw new Error('Only explicit write-oriented commands are allowed.');
  },
  pickDefinedEntries: (input: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)),
  buildNextStepHints: (options?: { publish?: boolean; notes?: string[] }) => [
    ...(options?.publish ? ['publish'] : []),
    ...(options?.notes ?? []),
  ],
  formatMutationResult: (options: Record<string, any>) =>
    JSON.stringify(
      {
        action: options.action,
        uid: options.response?.uid,
        name: options.response?.name,
        next_steps: options.nextSteps ?? [],
      },
      null,
      2
    ),
}));

import { SessionContext } from '@chkp/mcp-utils';
import { registerManagementWriteTools } from './write-tools';

function createMockServer() {
  const tools: Record<string, any> = {};
  return {
    tools,
    server: {
      tool: jest.fn((name: string, _description: string, schema: any, handler: any) => {
        tools[name] = { schema, handler };
      }),
    },
  };
}

describe('management write tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('registers core write tools including session controls', () => {
    const { server, tools } = createMockServer();
    registerManagementWriteTools(server as any, {});

    expect(tools.publish_session).toBeDefined();
    expect(tools.discard_session).toBeDefined();
    expect(tools.add_host).toBeDefined();
    expect(tools.set_network).toBeDefined();
    expect(tools.delete_package).toBeUndefined();
  });

  test('add_host maps payload and domain to add-host', async () => {
    const { server, tools } = createMockServer();
    const callApi = jest.fn().mockResolvedValue({ uid: '1', name: 'host-1' });
    (SessionContext.getAPIManager as jest.Mock).mockReturnValue({ callApi });

    registerManagementWriteTools(server as any, {});

    const result = await tools.add_host.handler(
      {
        name: 'host-1',
        ip_address: '192.0.2.10',
        comments: 'example',
        domain: 'Domain A',
      },
      {}
    );

    expect(callApi).toHaveBeenCalledWith(
      'POST',
      'add-host',
      {
        name: 'host-1',
        comments: 'example',
        'ip-address': '192.0.2.10',
      },
      'Domain A'
    );
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      action: 'add_host',
      name: 'host-1',
      uid: '1',
    });
  });

  test('set_network rejects calls without target identifier', async () => {
    const { server, tools } = createMockServer();
    registerManagementWriteTools(server as any, {});

    await expect(
      tools.set_network.handler(
        {
          subnet: '192.0.2.0',
        },
        {}
      )
    ).rejects.toThrow('Either name or uid must be provided.');
  });

  test('publish_session calls publish endpoint', async () => {
    const { server, tools } = createMockServer();
    const callApi = jest.fn().mockResolvedValue({ 'task-id': 't1' });
    (SessionContext.getAPIManager as jest.Mock).mockReturnValue({ callApi });

    registerManagementWriteTools(server as any, {});

    await tools.publish_session.handler({ domain: 'Domain A' }, {});

    expect(callApi).toHaveBeenCalledWith('POST', 'publish', {}, 'Domain A');
  });

  test('delete_package maps to delete-package with name', async () => {
    const { server, tools } = createMockServer();
    const callApi = jest.fn().mockResolvedValue({ message: 'OK' });
    (SessionContext.getAPIManager as jest.Mock).mockReturnValue({ callApi });

    registerManagementWriteTools(server as any, {}, { destroyEnabled: true });

    await tools.delete_package.handler({ name: 'OT Package' }, {});

    expect(callApi).toHaveBeenCalledWith(
      'POST',
      'delete-package',
      {
        name: 'OT Package',
      },
      undefined
    );
  });

  test('management__write_command rejects non-write commands', async () => {
    const { server, tools } = createMockServer();
    registerManagementWriteTools(server as any, {});

    await expect(
      tools['management__write_command'].handler(
        {
          command: 'show-host',
          payload: { name: 'x' },
        },
        {}
      )
    ).rejects.toThrow('Only explicit write-oriented commands are allowed.');
  });

  test('management__write_command rejects delete commands without destroy access', async () => {
    const { server, tools } = createMockServer();
    registerManagementWriteTools(server as any, {});

    await expect(
      tools['management__write_command'].handler(
        {
          command: 'delete-host',
          payload: { name: 'host-1' },
        },
        {}
      )
    ).rejects.toThrow('Only explicit write-oriented commands are allowed.');
  });

  test('management__write_command rejects path traversal commands', async () => {
    const { server, tools } = createMockServer();
    registerManagementWriteTools(server as any, {});

    await expect(
      tools['management__write_command'].handler(
        {
          command: 'set-host/../../../other',
          payload: { name: 'x' },
        },
        {}
      )
    ).rejects.toThrow('Command must contain only lowercase letters, digits, and hyphens');
  });

  test('management__write_command forwards normalized command', async () => {
    const { server, tools } = createMockServer();
    const callApi = jest.fn().mockResolvedValue({ uid: '1', name: 'host-1' });
    (SessionContext.getAPIManager as jest.Mock).mockReturnValue({ callApi });

    registerManagementWriteTools(server as any, {});

    await tools['management__write_command'].handler(
      {
        command: ' SET-HOST ',
        payload: { name: 'host-1', comments: 'updated' },
      },
      {}
    );

    expect(callApi).toHaveBeenCalledWith('POST', 'set-host', { name: 'host-1', comments: 'updated' }, undefined);
  });

  test('management__write_command allows delete commands with destroy access', async () => {
    const { server, tools } = createMockServer();
    const callApi = jest.fn().mockResolvedValue({ message: 'OK' });
    (SessionContext.getAPIManager as jest.Mock).mockReturnValue({ callApi });

    registerManagementWriteTools(server as any, {}, { destroyEnabled: true });

    await tools['management__write_command'].handler(
      {
        command: ' DELETE-HOST ',
        payload: { name: 'host-1' },
      },
      {}
    );

    expect(callApi).toHaveBeenCalledWith('POST', 'delete-host', { name: 'host-1' }, undefined);
  });

  test('management__write_command uses normalized install-policy for next steps', async () => {
    const { server, tools } = createMockServer();
    const callApi = jest.fn().mockResolvedValue({ 'task-id': 't1' });
    (SessionContext.getAPIManager as jest.Mock).mockReturnValue({ callApi });

    registerManagementWriteTools(server as any, {});

    const result = await tools['management__write_command'].handler(
      {
        command: ' INSTALL-POLICY ',
        payload: { 'policy-package': 'OT Package' },
      },
      {}
    );

    expect(callApi).toHaveBeenCalledWith('POST', 'install-policy', { 'policy-package': 'OT Package' }, undefined);
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      next_steps: ['This generic write command explicitly triggered a policy install request.'],
    });
  });

  test('set_package rejects calls without update fields', async () => {
    const { server, tools } = createMockServer();
    registerManagementWriteTools(server as any, {});

    await expect(tools.set_package.handler({ name: 'OT Package' }, {})).rejects.toThrow(
      'Provide at least one field to update.'
    );
  });

  test('add_host rejects raw_payload identity conflicts', async () => {
    const { server, tools } = createMockServer();
    registerManagementWriteTools(server as any, {});

    await expect(
      tools.add_host.handler(
        {
          name: 'host-1',
          ip_address: '192.0.2.10',
          raw_payload: { name: 'host-2' },
        },
        {}
      )
    ).rejects.toThrow('raw_payload must not override name');
  });
});
