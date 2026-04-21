jest.mock('@chkp/mcp-utils', () => ({
  SessionContext: {
    getAPIManager: jest.fn(),
  },
}));

jest.mock('@chkp/quantum-infra', () => ({
  assertWriteCommand: (command: string) => {
    const normalized = command.trim().toLowerCase();
    if (!/^[a-z][a-z0-9-]*$/.test(normalized)) {
      throw new Error('Command must contain only lowercase letters, digits, and hyphens');
    }
    if (['publish', 'discard'].includes(normalized) || normalized.startsWith('add-') || normalized.startsWith('set-') || normalized.startsWith('delete-')) {
      return normalized;
    }
    throw new Error('Only explicit write-oriented commands are allowed.');
  },
  pickDefinedEntries: (input: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)),
  buildNextStepHints: (_options?: unknown) => ['publish'],
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
import { registerThreatPreventionWriteTools } from './write-tools';

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

describe('threat prevention write tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('add_exception_group maps payload to the expected endpoint', async () => {
    const { server, tools } = createMockServer();
    const callApi = jest.fn().mockResolvedValue({ uid: 'eg-1', name: 'group-1' });
    (SessionContext.getAPIManager as jest.Mock).mockReturnValue({ callApi });

    registerThreatPreventionWriteTools(server as any, {});

    await tools.add_exception_group.handler(
      {
        name: 'group-1',
        profile: 'Strict',
        protections: ['Protection A'],
        domain: 'TP Domain',
      },
      {}
    );

    expect(callApi).toHaveBeenCalledWith(
      'POST',
      'add-exception-group',
      {
        name: 'group-1',
        profile: 'Strict',
        protections: ['Protection A'],
      },
      'TP Domain'
    );
  });

  test('set_threat_profile requires an update field', async () => {
    const { server, tools } = createMockServer();
    registerThreatPreventionWriteTools(server as any, {});

    await expect(
      tools.set_threat_profile.handler(
        {
          name: 'profile-1',
        },
        {}
      )
    ).rejects.toThrow('Provide at least one field to update.');
  });

  test('discard_session calls discard endpoint', async () => {
    const { server, tools } = createMockServer();
    const callApi = jest.fn().mockResolvedValue({ message: 'OK' });
    (SessionContext.getAPIManager as jest.Mock).mockReturnValue({ callApi });

    registerThreatPreventionWriteTools(server as any, {});

    await tools.discard_session.handler({ domain: 'TP Domain' }, {});

    expect(callApi).toHaveBeenCalledWith('POST', 'discard', {}, 'TP Domain');
  });

  test('delete_threat_profile maps to delete-threat-profile', async () => {
    const { server, tools } = createMockServer();
    const callApi = jest.fn().mockResolvedValue({ message: 'OK' });
    (SessionContext.getAPIManager as jest.Mock).mockReturnValue({ callApi });

    registerThreatPreventionWriteTools(server as any, {});

    await tools.delete_threat_profile.handler({ name: 'profile-1' }, {});

    expect(callApi).toHaveBeenCalledWith(
      'POST',
      'delete-threat-profile',
      {
        name: 'profile-1',
      },
      undefined
    );
  });

  test('threat-prevention__write_command rejects path traversal commands', async () => {
    const { server, tools } = createMockServer();
    registerThreatPreventionWriteTools(server as any, {});

    await expect(
      tools['threat-prevention__write_command'].handler(
        {
          command: 'set-threat-profile/../../../other',
          payload: { name: 'profile-1' },
        },
        {}
      )
    ).rejects.toThrow('Command must contain only lowercase letters, digits, and hyphens');
  });

  test('threat-prevention__write_command rejects install-policy', async () => {
    const { server, tools } = createMockServer();
    registerThreatPreventionWriteTools(server as any, {});

    await expect(
      tools['threat-prevention__write_command'].handler(
        {
          command: 'install-policy',
          payload: { 'policy-package': 'p1' },
        },
        {}
      )
    ).rejects.toThrow('Only explicit write-oriented commands are allowed.');
  });

  test('set_threat_exception rejects calls without update fields', async () => {
    const { server, tools } = createMockServer();
    registerThreatPreventionWriteTools(server as any, {});

    await expect(tools.set_threat_exception.handler({ rule_number: 1 }, {})).rejects.toThrow(
      'Provide at least one field to update.'
    );
  });

  test('set_threat_exception rejects raw_payload target conflicts', async () => {
    const { server, tools } = createMockServer();
    registerThreatPreventionWriteTools(server as any, {});

    await expect(
      tools.set_threat_exception.handler(
        {
          rule_number: 1,
          comments: 'updated',
          raw_payload: { 'rule-number': 2 },
        },
        {}
      )
    ).rejects.toThrow('raw_payload must not override rule-number');
  });
});
