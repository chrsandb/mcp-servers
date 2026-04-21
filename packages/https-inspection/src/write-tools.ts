import { z } from 'zod';
import { SessionContext, CPMcpServer } from '@chkp/mcp-utils';
import {
  assertNoRawPayloadConflicts,
  assertWriteCommand,
  buildNextStepHints,
  formatMutationResult,
  pickDefinedEntries,
} from '@chkp/quantum-infra';

const domainSchema = z.string().trim().min(1).optional();
const rawPayloadSchema = z.record(z.unknown()).optional();
const commandSchema = z.string().trim().min(1);

function getDomain(args: Record<string, unknown>): string | undefined {
  return typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
}

export function registerHttpsInspectionWriteTools(server: CPMcpServer, serverModule: any) {
  server.tool(
    'publish_session',
    'Publish the current HTTPS inspection management session.',
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
    'Discard the current HTTPS inspection management session draft changes.',
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

  server.tool(
    'set_https_rule',
    'Update an HTTPS inspection rule in the current management session draft.',
    {
      uid: z.string().trim().min(1).optional(),
      rule_number: z.union([z.string().trim().min(1), z.number().int().positive()]).optional(),
      layer: z.string().trim().min(1).optional(),
      enabled: z.boolean().optional(),
      action: z.string().trim().min(1).optional(),
      comments: z.string().optional(),
      track: z.string().trim().min(1).optional(),
      certificate: z.string().trim().min(1).optional(),
      source: z.array(z.string().trim().min(1)).optional(),
      destination: z.array(z.string().trim().min(1)).optional(),
      services: z.array(z.string().trim().min(1)).optional(),
      site_category: z.array(z.string().trim().min(1)).optional(),
      raw_payload: rawPayloadSchema,
      domain: domainSchema,
    },
    async (args: Record<string, unknown>, extra: any) => {
      if (!args.uid && args.rule_number === undefined) {
        throw new Error('Provide uid or rule_number.');
      }
      if (!args.uid && !args.layer) {
        throw new Error('Provide layer when addressing a rule by rule_number.');
      }
      if (
        args.enabled === undefined &&
        args.action === undefined &&
        args.comments === undefined &&
        args.track === undefined &&
        args.certificate === undefined &&
        args.source === undefined &&
        args.destination === undefined &&
        args.services === undefined &&
        args.site_category === undefined &&
        args.raw_payload === undefined
      ) {
        throw new Error('Provide at least one field to update.');
      }
      assertNoRawPayloadConflicts(args, { uid: 'uid', layer: 'layer', rule_number: 'rule-number' });

      const payload = {
        ...pickDefinedEntries({
          uid: args.uid,
          layer: args.layer,
          'rule-number': args.rule_number,
          enabled: args.enabled,
          action: args.action,
          comments: args.comments,
          track: args.track,
          certificate: args.certificate,
          source: args.source,
          destination: args.destination,
          services: args.services,
          'site-category': args.site_category,
        }),
        ...(args.raw_payload as Record<string, unknown> | undefined),
      };

      const apiManager = SessionContext.getAPIManager(serverModule, extra);
      const response = await apiManager.callApi('POST', 'set-https-rule', payload, getDomain(args));

      return {
        content: [
          {
            type: 'text',
            text: formatMutationResult({
              action: 'set_https_rule',
              target: {
                type: 'https-rule',
                uid: args.uid as string | undefined,
                layer: args.layer as string | undefined,
                ruleNumber: args.rule_number as string | number | undefined,
              },
              response,
              nextSteps: buildNextStepHints({ publish: true }),
            }),
          },
        ],
      };
    }
  );

  server.tool(
    'add_https_rule',
    'Create an HTTPS inspection rule in the current management session draft.',
    {
      layer: z.string().trim().min(1).optional(),
      position: z.string().trim().min(1).optional(),
      enabled: z.boolean().optional(),
      action: z.string().trim().min(1).optional(),
      comments: z.string().optional(),
      track: z.string().trim().min(1).optional(),
      certificate: z.string().trim().min(1).optional(),
      source: z.array(z.string().trim().min(1)).optional(),
      destination: z.array(z.string().trim().min(1)).optional(),
      services: z.array(z.string().trim().min(1)).optional(),
      site_category: z.array(z.string().trim().min(1)).optional(),
      raw_payload: rawPayloadSchema,
      domain: domainSchema,
    },
    async (args: Record<string, unknown>, extra: any) => {
      const rawPayload = args.raw_payload as Record<string, unknown> | undefined;
      if (!args.layer && (!rawPayload || !('layer' in rawPayload))) {
        throw new Error('Provide layer (required by the add-https-rule API).');
      }
      assertNoRawPayloadConflicts(args, { layer: 'layer' });

      const payload = {
        ...pickDefinedEntries({
          layer: args.layer,
          position: args.position,
          enabled: args.enabled,
          action: args.action,
          comments: args.comments,
          track: args.track,
          certificate: args.certificate,
          source: args.source,
          destination: args.destination,
          services: args.services,
          'site-category': args.site_category,
        }),
        ...(args.raw_payload as Record<string, unknown> | undefined),
      };

      const apiManager = SessionContext.getAPIManager(serverModule, extra);
      const response = await apiManager.callApi('POST', 'add-https-rule', payload, getDomain(args));

      return {
        content: [
          {
            type: 'text',
            text: formatMutationResult({
              action: 'add_https_rule',
              target: {
                type: 'https-rule',
                layer: args.layer as string | undefined,
              },
              response,
              nextSteps: buildNextStepHints({ publish: true }),
            }),
          },
        ],
      };
    }
  );

  server.tool(
    'delete_https_rule',
    'Delete an HTTPS inspection rule from the current management session draft.',
    {
      uid: z.string().trim().min(1).optional(),
      rule_number: z.union([z.string().trim().min(1), z.number().int().positive()]).optional(),
      layer: z.string().trim().min(1).optional(),
      raw_payload: rawPayloadSchema,
      domain: domainSchema,
    },
    async (args: Record<string, unknown>, extra: any) => {
      if (!args.uid && args.rule_number === undefined) {
        throw new Error('Provide uid or rule_number.');
      }
      if (!args.uid && !args.layer) {
        throw new Error('Provide layer when addressing a rule by rule_number.');
      }
      assertNoRawPayloadConflicts(args, { uid: 'uid', layer: 'layer', rule_number: 'rule-number' });

      const payload = {
        ...pickDefinedEntries({
          uid: args.uid,
          layer: args.layer,
          'rule-number': args.rule_number,
        }),
        ...(args.raw_payload as Record<string, unknown> | undefined),
      };

      const apiManager = SessionContext.getAPIManager(serverModule, extra);
      const response = await apiManager.callApi('POST', 'delete-https-rule', payload, getDomain(args));

      return {
        content: [
          {
            type: 'text',
            text: formatMutationResult({
              action: 'delete_https_rule',
              target: {
                type: 'https-rule',
                uid: args.uid as string | undefined,
                layer: args.layer as string | undefined,
                ruleNumber: args.rule_number as string | number | undefined,
              },
              response,
              nextSteps: buildNextStepHints({ publish: true }),
            }),
          },
        ],
      };
    }
  );

  server.tool(
    'https-inspection__write_command',
    'Execute an explicit write-oriented HTTPS inspection API command such as add-*, set-*, delete-*, publish, or discard. Use the management install_policy tool for install-policy.',
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
              action: 'https-inspection__write_command',
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
