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
import { registerHttpsInspectionWriteTools } from './write-tools';

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

describe('https inspection write tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('set_https_rule maps rule_number-based updates correctly', async () => {
    const { server, tools } = createMockServer();
    const callApi = jest.fn().mockResolvedValue({ uid: 'rule-1' });
    (SessionContext.getAPIManager as jest.Mock).mockReturnValue({ callApi });

    registerHttpsInspectionWriteTools(server as any, {});

    await tools.set_https_rule.handler(
      {
        rule_number: 12,
        layer: 'HTTPS Layer',
        enabled: true,
        action: 'inspect',
        domain: 'HTTPS Domain',
      },
      {}
    );

    expect(callApi).toHaveBeenCalledWith(
      'POST',
      'set-https-rule',
      {
        layer: 'HTTPS Layer',
        'rule-number': 12,
        enabled: true,
        action: 'inspect',
      },
      'HTTPS Domain'
    );
  });

  test('set_https_rule requires layer when using rule_number', async () => {
    const { server, tools } = createMockServer();
    registerHttpsInspectionWriteTools(server as any, {});

    await expect(
      tools.set_https_rule.handler(
        {
          rule_number: 12,
          enabled: true,
        },
        {}
      )
    ).rejects.toThrow('Provide layer when addressing a rule by rule_number.');
  });

  test('delete_https_rule maps uid-based deletes correctly', async () => {
    const { server, tools } = createMockServer();
    const callApi = jest.fn().mockResolvedValue({ message: 'OK' });
    (SessionContext.getAPIManager as jest.Mock).mockReturnValue({ callApi });

    registerHttpsInspectionWriteTools(server as any, {});

    await tools.delete_https_rule.handler(
      {
        uid: 'rule-1',
      },
      {}
    );

    expect(callApi).toHaveBeenCalledWith(
      'POST',
      'delete-https-rule',
      {
        uid: 'rule-1',
      },
      undefined
    );
  });

  test('https-inspection__write_command rejects path traversal commands', async () => {
    const { server, tools } = createMockServer();
    registerHttpsInspectionWriteTools(server as any, {});

    await expect(
      tools['https-inspection__write_command'].handler(
        {
          command: 'set-https-rule/../../../other',
          payload: { uid: 'rule-1' },
        },
        {}
      )
    ).rejects.toThrow('Command must contain only lowercase letters, digits, and hyphens');
  });

  test('https-inspection__write_command rejects install-policy', async () => {
    const { server, tools } = createMockServer();
    registerHttpsInspectionWriteTools(server as any, {});

    await expect(
      tools['https-inspection__write_command'].handler(
        {
          command: 'install-policy',
          payload: { 'policy-package': 'p1' },
        },
        {}
      )
    ).rejects.toThrow('Only explicit write-oriented commands are allowed.');
  });

  test('add_https_rule requires layer when raw_payload does not provide it', async () => {
    const { server, tools } = createMockServer();
    registerHttpsInspectionWriteTools(server as any, {});

    await expect(
      tools.add_https_rule.handler(
        {
          action: 'inspect',
        },
        {}
      )
    ).rejects.toThrow('Provide layer');
  });

  test('set_https_rule rejects raw_payload target conflicts', async () => {
    const { server, tools } = createMockServer();
    registerHttpsInspectionWriteTools(server as any, {});

    await expect(
      tools.set_https_rule.handler(
        {
          rule_number: 12,
          layer: 'HTTPS Layer',
          enabled: true,
          raw_payload: { layer: 'Other Layer' },
        },
        {}
      )
    ).rejects.toThrow('raw_payload must not override layer');
  });
});
