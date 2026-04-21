import { z } from 'zod';
import { SessionContext, CPMcpServer } from '@chkp/mcp-utils';
import {
  assertWriteCommand,
  buildNextStepHints,
  formatMutationResult,
  pickDefinedEntries,
} from '@chkp/quantum-infra';

const domainSchema = z.string().trim().min(1).optional();
const rawPayloadSchema = z.record(z.unknown()).optional();
const nameSchema = z.string().trim().min(1);
const uidSchema = z.string().trim().min(1);
const tagsSchema = z.array(z.string().trim().min(1)).optional();
const commandSchema = z.string().trim().min(1);

function getDomain(args: Record<string, unknown>): string | undefined {
  return typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
}

function buildCommonPayload(args: Record<string, unknown>) {
  return pickDefinedEntries({
    comments: args.comments,
    color: args.color,
    tags: args.tags,
    'ignore-warnings': args.ignore_warnings,
    'ignore-errors': args.ignore_errors,
  });
}

function getRequiredNameOrUid(args: Record<string, unknown>): Record<string, string> {
  if (typeof args.name === 'string' && args.name.trim() !== '') {
    return { name: args.name };
  }

  if (typeof args.uid === 'string' && args.uid.trim() !== '') {
    return { uid: args.uid };
  }

  throw new Error('Either name or uid must be provided.');
}

async function runMutation(
  serverModule: any,
  extra: any,
  uri: string,
  payload: Record<string, any>,
  domain: string | undefined,
  action: string,
  target: Record<string, any>
) {
  if (target.name !== undefined && payload.name !== undefined && payload.name !== target.name) {
    throw new Error('raw_payload must not override name when name is provided as a named field.');
  }
  if (target.uid !== undefined && payload.uid !== undefined && payload.uid !== target.uid) {
    throw new Error('raw_payload must not override uid when uid is provided as a named field.');
  }
  if (target.layer !== undefined && payload.layer !== undefined && payload.layer !== target.layer) {
    throw new Error('raw_payload must not override layer when layer is provided as a named field.');
  }
  if (
    target.ruleUid !== undefined &&
    payload['rule-uid'] !== undefined &&
    payload['rule-uid'] !== target.ruleUid
  ) {
    throw new Error('raw_payload must not override rule-uid when rule_uid is provided as a named field.');
  }
  if (
    target.ruleNumber !== undefined &&
    payload['rule-number'] !== undefined &&
    payload['rule-number'] !== target.ruleNumber
  ) {
    throw new Error('raw_payload must not override rule-number when rule_number is provided as a named field.');
  }

  const apiManager = SessionContext.getAPIManager(serverModule, extra);
  const response = await apiManager.callApi('POST', uri, payload, domain);

  return {
    content: [
      {
        type: 'text',
        text: formatMutationResult({
          action,
          target,
          response,
          nextSteps: buildNextStepHints({ publish: true }),
        }),
      },
    ],
  };
}

function registerSessionTools(server: CPMcpServer, serverModule: any) {
  server.tool(
    'publish_session',
    'Publish the current threat prevention management session.',
    {
      domain: domainSchema,
    },
    async (args: Record<string, unknown>, extra: any) => {
      const apiManager = SessionContext.getAPIManager(serverModule, extra);
      const response = await apiManager.callApi('POST', 'publish', {}, getDomain(args));
      return {
        content: [{ type: 'text', text: formatMutationResult({ action: 'publish_session', response }) }],
      };
    }
  );

  server.tool(
    'discard_session',
    'Discard the current threat prevention management session draft changes.',
    {
      domain: domainSchema,
    },
    async (args: Record<string, unknown>, extra: any) => {
      const apiManager = SessionContext.getAPIManager(serverModule, extra);
      const response = await apiManager.callApi('POST', 'discard', {}, getDomain(args));
      return {
        content: [{ type: 'text', text: formatMutationResult({ action: 'discard_session', response }) }],
      };
    }
  );
}

export function registerThreatPreventionWriteTools(server: CPMcpServer, serverModule: any) {
  registerSessionTools(server, serverModule);

  server.tool(
    'add_threat_profile',
    'Create a threat profile in the current management session draft.',
    {
      name: nameSchema,
      comments: z.string().optional(),
      color: z.string().trim().min(1).optional(),
      tags: tagsSchema,
      ignore_warnings: z.boolean().optional(),
      ignore_errors: z.boolean().optional(),
      raw_payload: rawPayloadSchema,
      domain: domainSchema,
    },
    async (args: Record<string, unknown>, extra: any) => {
      const payload = {
        name: args.name,
        ...buildCommonPayload(args),
        ...(args.raw_payload as Record<string, unknown> | undefined),
      };

      return runMutation(
        serverModule,
        extra,
        'add-threat-profile',
        payload,
        getDomain(args),
        'add_threat_profile',
        { type: 'threat-profile', name: args.name as string }
      );
    }
  );

  server.tool(
    'set_threat_profile',
    'Update a threat profile in the current management session draft.',
    {
      name: nameSchema.optional(),
      uid: uidSchema.optional(),
      comments: z.string().optional(),
      color: z.string().trim().min(1).optional(),
      tags: tagsSchema,
      ignore_warnings: z.boolean().optional(),
      ignore_errors: z.boolean().optional(),
      raw_payload: rawPayloadSchema,
      domain: domainSchema,
    },
    async (args: Record<string, unknown>, extra: any) => {
      if (!args.name && !args.uid) {
        throw new Error('Either name or uid must be provided.');
      }
      if (
        args.comments === undefined &&
        args.color === undefined &&
        args.tags === undefined &&
        args.ignore_warnings === undefined &&
        args.ignore_errors === undefined &&
        args.raw_payload === undefined
      ) {
        throw new Error('Provide at least one field to update.');
      }

      const payload = {
        ...pickDefinedEntries({ name: args.name, uid: args.uid }),
        ...buildCommonPayload(args),
        ...(args.raw_payload as Record<string, unknown> | undefined),
      };

      return runMutation(
        serverModule,
        extra,
        'set-threat-profile',
        payload,
        getDomain(args),
        'set_threat_profile',
        {
          type: 'threat-profile',
          name: args.name as string | undefined,
          uid: args.uid as string | undefined,
        }
      );
    }
  );

  server.tool(
    'add_exception_group',
    'Create an exception group in the current management session draft.',
    {
      name: nameSchema,
      profile: z.string().trim().min(1).optional(),
      protections: z.array(z.string().trim().min(1)).optional(),
      comments: z.string().optional(),
      color: z.string().trim().min(1).optional(),
      tags: tagsSchema,
      ignore_warnings: z.boolean().optional(),
      ignore_errors: z.boolean().optional(),
      raw_payload: rawPayloadSchema,
      domain: domainSchema,
    },
    async (args: Record<string, unknown>, extra: any) => {
      const payload = {
        name: args.name,
        ...buildCommonPayload(args),
        ...pickDefinedEntries({
          profile: args.profile,
          protections: args.protections,
        }),
        ...(args.raw_payload as Record<string, unknown> | undefined),
      };

      return runMutation(
        serverModule,
        extra,
        'add-exception-group',
        payload,
        getDomain(args),
        'add_exception_group',
        { type: 'exception-group', name: args.name as string }
      );
    }
  );

  server.tool(
    'set_exception_group',
    'Update an exception group in the current management session draft.',
    {
      name: nameSchema.optional(),
      uid: uidSchema.optional(),
      profile: z.string().trim().min(1).optional(),
      protections: z.array(z.string().trim().min(1)).optional(),
      comments: z.string().optional(),
      color: z.string().trim().min(1).optional(),
      tags: tagsSchema,
      ignore_warnings: z.boolean().optional(),
      ignore_errors: z.boolean().optional(),
      raw_payload: rawPayloadSchema,
      domain: domainSchema,
    },
    async (args: Record<string, unknown>, extra: any) => {
      if (!args.name && !args.uid) {
        throw new Error('Either name or uid must be provided.');
      }
      if (
        args.profile === undefined &&
        args.protections === undefined &&
        args.comments === undefined &&
        args.color === undefined &&
        args.tags === undefined &&
        args.ignore_warnings === undefined &&
        args.ignore_errors === undefined &&
        args.raw_payload === undefined
      ) {
        throw new Error('Provide at least one field to update.');
      }

      const payload = {
        ...pickDefinedEntries({ name: args.name, uid: args.uid }),
        ...buildCommonPayload(args),
        ...pickDefinedEntries({
          profile: args.profile,
          protections: args.protections,
        }),
        ...(args.raw_payload as Record<string, unknown> | undefined),
      };

      return runMutation(
        serverModule,
        extra,
        'set-exception-group',
        payload,
        getDomain(args),
        'set_exception_group',
        {
          type: 'exception-group',
          name: args.name as string | undefined,
          uid: args.uid as string | undefined,
        }
      );
    }
  );

  for (const [toolPrefix, uriBase] of [
    ['threat_profile', 'threat-profile'],
    ['exception_group', 'exception-group'],
  ] as const) {
    server.tool(
      `delete_${toolPrefix}`,
      `Delete a ${uriBase} in the current management session draft.`,
      {
        name: nameSchema.optional(),
        uid: uidSchema.optional(),
        ignore_warnings: z.boolean().optional(),
        ignore_errors: z.boolean().optional(),
        raw_payload: rawPayloadSchema,
        domain: domainSchema,
      },
      async (args: Record<string, unknown>, extra: any) => {
        const payload = {
          ...getRequiredNameOrUid(args),
          ...pickDefinedEntries({
            'ignore-warnings': args.ignore_warnings,
            'ignore-errors': args.ignore_errors,
          }),
          ...(args.raw_payload as Record<string, unknown> | undefined),
        };

        return runMutation(
          serverModule,
          extra,
          `delete-${uriBase}`,
          payload,
          getDomain(args),
          `delete_${toolPrefix}`,
          {
            type: uriBase,
            name: args.name as string | undefined,
            uid: args.uid as string | undefined,
          }
        );
      }
    );
  }

  for (const [toolPrefix, uriBase] of [['threat_exception', 'threat-exception']] as const) {
    server.tool(
      `add_${toolPrefix}`,
      `Create a ${uriBase} in the current management session draft.`,
      {
        layer: z.string().trim().min(1).optional(),
        rule_uid: uidSchema.optional(),
        rule_number: z.union([z.string().trim().min(1), z.number().int().positive()]).optional(),
        name: nameSchema.optional(),
        comments: z.string().optional(),
        protected_scope: z.array(z.string().trim().min(1)).optional(),
        action: z.string().trim().min(1).optional(),
        raw_payload: rawPayloadSchema,
        domain: domainSchema,
      },
      async (args: Record<string, unknown>, extra: any) => {
        const payload = {
          ...pickDefinedEntries({
            layer: args.layer,
            'rule-uid': args.rule_uid,
            'rule-number': args.rule_number,
            name: args.name,
            comments: args.comments,
            'protected-scope': args.protected_scope,
            action: args.action,
          }),
          ...(args.raw_payload as Record<string, unknown> | undefined),
        };
        return runMutation(serverModule, extra, `add-${uriBase}`, payload, getDomain(args), `add_${toolPrefix}`, {
          type: uriBase,
          name: args.name as string | undefined,
          ruleUid: args.rule_uid as string | undefined,
          layer: args.layer as string | undefined,
          ruleNumber: args.rule_number as string | number | undefined,
        });
      }
    );

    server.tool(
      `set_${toolPrefix}`,
      `Update a ${uriBase} in the current management session draft.`,
      {
        name: nameSchema.optional(),
        uid: uidSchema.optional(),
        layer: z.string().trim().min(1).optional(),
        rule_uid: uidSchema.optional(),
        rule_number: z.union([z.string().trim().min(1), z.number().int().positive()]).optional(),
        comments: z.string().optional(),
        protected_scope: z.array(z.string().trim().min(1)).optional(),
        action: z.string().trim().min(1).optional(),
        raw_payload: rawPayloadSchema,
        domain: domainSchema,
      },
      async (args: Record<string, unknown>, extra: any) => {
        if (!args.name && !args.uid && !args.rule_uid && args.rule_number === undefined) {
          throw new Error('Provide name, uid, rule_uid, or rule_number.');
        }
        if (
          args.comments === undefined &&
          args.protected_scope === undefined &&
          args.action === undefined &&
          args.raw_payload === undefined
        ) {
          throw new Error('Provide at least one field to update.');
        }
        const payload = {
          ...pickDefinedEntries({
            name: args.name,
            uid: args.uid,
            layer: args.layer,
            'rule-uid': args.rule_uid,
            'rule-number': args.rule_number,
            comments: args.comments,
            'protected-scope': args.protected_scope,
            action: args.action,
          }),
          ...(args.raw_payload as Record<string, unknown> | undefined),
        };
        return runMutation(serverModule, extra, `set-${uriBase}`, payload, getDomain(args), `set_${toolPrefix}`, {
          type: uriBase,
          name: args.name as string | undefined,
          uid: args.uid as string | undefined,
          ruleUid: args.rule_uid as string | undefined,
          layer: args.layer as string | undefined,
          ruleNumber: args.rule_number as string | number | undefined,
        });
      }
    );

    server.tool(
      `delete_${toolPrefix}`,
      `Delete a ${uriBase} from the current management session draft.`,
      {
        name: nameSchema.optional(),
        uid: uidSchema.optional(),
        layer: z.string().trim().min(1).optional(),
        rule_uid: uidSchema.optional(),
        rule_number: z.union([z.string().trim().min(1), z.number().int().positive()]).optional(),
        raw_payload: rawPayloadSchema,
        domain: domainSchema,
      },
      async (args: Record<string, unknown>, extra: any) => {
        if (!args.name && !args.uid && !args.rule_uid && args.rule_number === undefined) {
          throw new Error('Provide name, uid, rule_uid, or rule_number.');
        }
        const payload = {
          ...pickDefinedEntries({
            name: args.name,
            uid: args.uid,
            layer: args.layer,
            'rule-uid': args.rule_uid,
            'rule-number': args.rule_number,
          }),
          ...(args.raw_payload as Record<string, unknown> | undefined),
        };
        return runMutation(serverModule, extra, `delete-${uriBase}`, payload, getDomain(args), `delete_${toolPrefix}`, {
          type: uriBase,
          name: args.name as string | undefined,
          uid: args.uid as string | undefined,
          ruleUid: args.rule_uid as string | undefined,
          layer: args.layer as string | undefined,
          ruleNumber: args.rule_number as string | number | undefined,
        });
      }
    );
  }

  server.tool(
    'threat-prevention__write_command',
    'Execute an explicit write-oriented threat-prevention API command such as add-*, set-*, delete-*, publish, or discard. Use the management install_policy tool for install-policy.',
    {
      command: commandSchema,
      payload: z.record(z.unknown()).optional(),
      domain: domainSchema,
    },
    async (args: Record<string, unknown>, extra: any) => {
      const command = assertWriteCommand(args.command as string);
      const apiManager = SessionContext.getAPIManager(serverModule, extra);
      const response = await apiManager.callApi('POST', command, (args.payload as Record<string, unknown> | undefined) ?? {}, getDomain(args));
      return {
        content: [
          {
            type: 'text',
            text: formatMutationResult({
              action: 'threat-prevention__write_command',
              target: { type: command },
              response,
              nextSteps: buildNextStepHints({ publish: command !== 'publish' && command !== 'discard' }),
            }),
          },
        ],
      };
    }
  );
}
