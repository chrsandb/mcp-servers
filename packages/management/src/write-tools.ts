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
const nameSchema = z.string().trim().min(1);
const uidSchema = z.string().trim().min(1);
const colorSchema = z.string().trim().min(1).optional();
const commentsSchema = z.string().optional();
const tagsSchema = z.array(z.string().trim().min(1)).optional();
const rawPayloadSchema = z.record(z.unknown()).optional();
const ignoreWarningsSchema = z.boolean().optional();
const ignoreErrorsSchema = z.boolean().optional();
const commandSchema = z.string().trim().min(1);

function requireMutableFields<T extends Record<string, unknown>>(
  value: T,
  keys: Array<keyof T>
): boolean {
  return keys.some((key) => value[key] !== undefined);
}

function buildCommonPayload(args: Record<string, unknown>): Record<string, any> {
  return pickDefinedEntries({
    color: args.color,
    comments: args.comments,
    tags: args.tags,
    'ignore-warnings': args.ignore_warnings,
    'ignore-errors': args.ignore_errors,
  });
}

function getDomain(args: Record<string, unknown>): string | undefined {
  return typeof args.domain === 'string' && args.domain.trim() !== '' ? args.domain : undefined;
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
  target: Record<string, any>,
  nextSteps: string[] = buildNextStepHints({ publish: true })
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
  if (target.package !== undefined && payload.package !== undefined && payload.package !== target.package) {
    throw new Error('raw_payload must not override package when package is provided as a named field.');
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
          nextSteps,
        }),
      },
    ],
  };
}

async function runWriteCommand(
  serverModule: any,
  extra: any,
  command: string,
  payload: Record<string, any>,
  domain: string | undefined,
  action: string,
  options?: {
    allowDelete?: boolean;
  },
  target?: Record<string, any>,
  nextSteps?: string[]
) {
  const safeCommand = assertWriteCommand(command, {
    allowInstallPolicy: true,
    allowDelete: options?.allowDelete,
  });
  return runMutation(
    serverModule,
    extra,
    safeCommand,
    payload,
    domain,
    action,
    target ?? {},
    nextSteps ?? buildNextStepHints({ publish: true })
  );
}

function registerSessionTools(server: CPMcpServer, serverModule: any) {
  server.tool(
    'publish_session',
    'Publish the current management session. This is a separate explicit step after draft mutations.',
    {
      domain: domainSchema,
    },
    async (args: Record<string, unknown>, extra: any) => {
      const domain = getDomain(args);
      const apiManager = SessionContext.getAPIManager(serverModule, extra);
      const response = await apiManager.callApi('POST', 'publish', {}, domain);

      return {
        content: [
          {
            type: 'text',
            text: formatMutationResult({
              action: 'publish_session',
              response,
              nextSteps: buildNextStepHints({
                notes: ['Policy installation is still a separate manual step if needed.'],
              }),
            }),
          },
        ],
      };
    }
  );

  server.tool(
    'discard_session',
    'Discard the current management session draft changes.',
    {
      domain: domainSchema,
    },
    async (args: Record<string, unknown>, extra: any) => {
      const domain = getDomain(args);
      const apiManager = SessionContext.getAPIManager(serverModule, extra);
      const response = await apiManager.callApi('POST', 'discard', {}, domain);

      return {
        content: [
          {
            type: 'text',
            text: formatMutationResult({
              action: 'discard_session',
              response,
            }),
          },
        ],
      };
    }
  );
}

export function registerManagementWriteTools(
  server: CPMcpServer,
  serverModule: any,
  options?: { destroyEnabled?: boolean }
) {
  const destroyEnabled = options?.destroyEnabled ?? false;
  registerSessionTools(server, serverModule);

  server.tool(
    'add_host',
    'Create a host object in the current management session draft.',
    {
      name: nameSchema,
      ip_address: z.string().trim().min(1).optional(),
      ipv4_address: z.string().trim().min(1).optional(),
      ipv6_address: z.string().trim().min(1).optional(),
      groups: z.array(z.string().trim().min(1)).optional(),
      color: colorSchema,
      comments: commentsSchema,
      tags: tagsSchema,
      ignore_warnings: ignoreWarningsSchema,
      ignore_errors: ignoreErrorsSchema,
      raw_payload: rawPayloadSchema,
      domain: domainSchema,
    },
    async (args: Record<string, unknown>, extra: any) => {
      if (!args.ip_address && !args.ipv4_address && !args.ipv6_address && !args.raw_payload) {
        throw new Error('Provide ip_address, ipv4_address, ipv6_address, or raw_payload.');
      }

      const payload = {
        name: args.name,
        ...buildCommonPayload(args),
        ...pickDefinedEntries({
          'ip-address': args.ip_address,
          'ipv4-address': args.ipv4_address,
          'ipv6-address': args.ipv6_address,
          groups: args.groups,
        }),
        ...(args.raw_payload as Record<string, unknown> | undefined),
      };

      return runMutation(serverModule, extra, 'add-host', payload, getDomain(args), 'add_host', {
        type: 'host',
        name: args.name as string,
      });
    }
  );

  server.tool(
    'set_host',
    'Update a host object in the current management session draft.',
    {
      name: nameSchema.optional(),
      uid: uidSchema.optional(),
      ip_address: z.string().trim().min(1).optional(),
      ipv4_address: z.string().trim().min(1).optional(),
      ipv6_address: z.string().trim().min(1).optional(),
      groups: z.array(z.string().trim().min(1)).optional(),
      color: colorSchema,
      comments: commentsSchema,
      tags: tagsSchema,
      ignore_warnings: ignoreWarningsSchema,
      ignore_errors: ignoreErrorsSchema,
      raw_payload: rawPayloadSchema,
      domain: domainSchema,
    },
    async (args: Record<string, unknown>, extra: any) => {
      if (!args.name && !args.uid) {
        throw new Error('Either name or uid must be provided.');
      }
      if (
        !requireMutableFields(args, [
          'ip_address',
          'ipv4_address',
          'ipv6_address',
          'groups',
          'color',
          'comments',
          'tags',
          'ignore_warnings',
          'ignore_errors',
          'raw_payload',
        ])
      ) {
        throw new Error('Provide at least one field to update.');
      }

      const payload = {
        ...pickDefinedEntries({ name: args.name, uid: args.uid }),
        ...buildCommonPayload(args),
        ...pickDefinedEntries({
          'ip-address': args.ip_address,
          'ipv4-address': args.ipv4_address,
          'ipv6-address': args.ipv6_address,
          groups: args.groups,
        }),
        ...(args.raw_payload as Record<string, unknown> | undefined),
      };

      return runMutation(serverModule, extra, 'set-host', payload, getDomain(args), 'set_host', {
        type: 'host',
        name: args.name as string | undefined,
        uid: args.uid as string | undefined,
      });
    }
  );

  server.tool(
    'add_network',
    'Create a network object in the current management session draft.',
    {
      name: nameSchema,
      subnet: z.string().trim().min(1).optional(),
      subnet_mask: z.string().trim().min(1).optional(),
      mask_length: z.number().int().min(0).max(128).optional(),
      color: colorSchema,
      comments: commentsSchema,
      tags: tagsSchema,
      ignore_warnings: ignoreWarningsSchema,
      ignore_errors: ignoreErrorsSchema,
      raw_payload: rawPayloadSchema,
      domain: domainSchema,
    },
    async (args: Record<string, unknown>, extra: any) => {
      const hasNetworkShape =
        args.subnet && (args.subnet_mask !== undefined || args.mask_length !== undefined);
      if (!hasNetworkShape && !args.raw_payload) {
        throw new Error('Provide subnet with subnet_mask or mask_length, or raw_payload.');
      }

      const payload = {
        name: args.name,
        ...buildCommonPayload(args),
        ...pickDefinedEntries({
          subnet: args.subnet,
          'subnet-mask': args.subnet_mask,
          'mask-length': args.mask_length,
        }),
        ...(args.raw_payload as Record<string, unknown> | undefined),
      };

      return runMutation(serverModule, extra, 'add-network', payload, getDomain(args), 'add_network', {
        type: 'network',
        name: args.name as string,
      });
    }
  );

  server.tool(
    'set_network',
    'Update a network object in the current management session draft.',
    {
      name: nameSchema.optional(),
      uid: uidSchema.optional(),
      subnet: z.string().trim().min(1).optional(),
      subnet_mask: z.string().trim().min(1).optional(),
      mask_length: z.number().int().min(0).max(128).optional(),
      color: colorSchema,
      comments: commentsSchema,
      tags: tagsSchema,
      ignore_warnings: ignoreWarningsSchema,
      ignore_errors: ignoreErrorsSchema,
      raw_payload: rawPayloadSchema,
      domain: domainSchema,
    },
    async (args: Record<string, unknown>, extra: any) => {
      if (!args.name && !args.uid) {
        throw new Error('Either name or uid must be provided.');
      }
      if (
        !requireMutableFields(args, [
          'subnet',
          'subnet_mask',
          'mask_length',
          'color',
          'comments',
          'tags',
          'ignore_warnings',
          'ignore_errors',
          'raw_payload',
        ])
      ) {
        throw new Error('Provide at least one field to update.');
      }

      const payload = {
        ...pickDefinedEntries({ name: args.name, uid: args.uid }),
        ...buildCommonPayload(args),
        ...pickDefinedEntries({
          subnet: args.subnet,
          'subnet-mask': args.subnet_mask,
          'mask-length': args.mask_length,
        }),
        ...(args.raw_payload as Record<string, unknown> | undefined),
      };

      return runMutation(serverModule, extra, 'set-network', payload, getDomain(args), 'set_network', {
        type: 'network',
        name: args.name as string | undefined,
        uid: args.uid as string | undefined,
      });
    }
  );

  server.tool(
    'add_address_range',
    'Create an address range object in the current management session draft.',
    {
      name: nameSchema,
      ipv4_address_first: z.string().trim().min(1).optional(),
      ipv4_address_last: z.string().trim().min(1).optional(),
      ipv6_address_first: z.string().trim().min(1).optional(),
      ipv6_address_last: z.string().trim().min(1).optional(),
      color: colorSchema,
      comments: commentsSchema,
      tags: tagsSchema,
      ignore_warnings: ignoreWarningsSchema,
      ignore_errors: ignoreErrorsSchema,
      raw_payload: rawPayloadSchema,
      domain: domainSchema,
    },
    async (args: Record<string, unknown>, extra: any) => {
      const hasIpv4Range = args.ipv4_address_first && args.ipv4_address_last;
      const hasIpv6Range = args.ipv6_address_first && args.ipv6_address_last;
      if (!hasIpv4Range && !hasIpv6Range && !args.raw_payload) {
        throw new Error(
          'Provide a complete IPv4 range (ipv4_address_first + ipv4_address_last), a complete IPv6 range (ipv6_address_first + ipv6_address_last), or raw_payload.'
        );
      }

      const payload = {
        name: args.name,
        ...buildCommonPayload(args),
        ...pickDefinedEntries({
          'ipv4-address-first': args.ipv4_address_first,
          'ipv4-address-last': args.ipv4_address_last,
          'ipv6-address-first': args.ipv6_address_first,
          'ipv6-address-last': args.ipv6_address_last,
        }),
        ...(args.raw_payload as Record<string, unknown> | undefined),
      };

      return runMutation(
        serverModule,
        extra,
        'add-address-range',
        payload,
        getDomain(args),
        'add_address_range',
        { type: 'address-range', name: args.name as string }
      );
    }
  );

  server.tool(
    'set_address_range',
    'Update an address range object in the current management session draft.',
    {
      name: nameSchema.optional(),
      uid: uidSchema.optional(),
      ipv4_address_first: z.string().trim().min(1).optional(),
      ipv4_address_last: z.string().trim().min(1).optional(),
      ipv6_address_first: z.string().trim().min(1).optional(),
      ipv6_address_last: z.string().trim().min(1).optional(),
      color: colorSchema,
      comments: commentsSchema,
      tags: tagsSchema,
      ignore_warnings: ignoreWarningsSchema,
      ignore_errors: ignoreErrorsSchema,
      raw_payload: rawPayloadSchema,
      domain: domainSchema,
    },
    async (args: Record<string, unknown>, extra: any) => {
      if (!args.name && !args.uid) {
        throw new Error('Either name or uid must be provided.');
      }
      if (
        !requireMutableFields(args, [
          'ipv4_address_first',
          'ipv4_address_last',
          'ipv6_address_first',
          'ipv6_address_last',
          'color',
          'comments',
          'tags',
          'ignore_warnings',
          'ignore_errors',
          'raw_payload',
        ])
      ) {
        throw new Error('Provide at least one field to update.');
      }

      const payload = {
        ...pickDefinedEntries({ name: args.name, uid: args.uid }),
        ...buildCommonPayload(args),
        ...pickDefinedEntries({
          'ipv4-address-first': args.ipv4_address_first,
          'ipv4-address-last': args.ipv4_address_last,
          'ipv6-address-first': args.ipv6_address_first,
          'ipv6-address-last': args.ipv6_address_last,
        }),
        ...(args.raw_payload as Record<string, unknown> | undefined),
      };

      return runMutation(
        serverModule,
        extra,
        'set-address-range',
        payload,
        getDomain(args),
        'set_address_range',
        {
          type: 'address-range',
          name: args.name as string | undefined,
          uid: args.uid as string | undefined,
        }
      );
    }
  );

  server.tool(
    'add_dns_domain',
    'Create a DNS domain object in the current management session draft.',
    {
      name: nameSchema,
      is_sub_domain: z.boolean().optional(),
      color: colorSchema,
      comments: commentsSchema,
      tags: tagsSchema,
      ignore_warnings: ignoreWarningsSchema,
      ignore_errors: ignoreErrorsSchema,
      raw_payload: rawPayloadSchema,
      domain: domainSchema,
    },
    async (args: Record<string, unknown>, extra: any) => {
      const payload = {
        name: args.name,
        ...buildCommonPayload(args),
        ...pickDefinedEntries({
          'is-sub-domain': args.is_sub_domain,
        }),
        ...(args.raw_payload as Record<string, unknown> | undefined),
      };

      return runMutation(serverModule, extra, 'add-dns-domain', payload, getDomain(args), 'add_dns_domain', {
        type: 'dns-domain',
        name: args.name as string,
      });
    }
  );

  server.tool(
    'set_dns_domain',
    'Update a DNS domain object in the current management session draft.',
    {
      name: nameSchema.optional(),
      uid: uidSchema.optional(),
      is_sub_domain: z.boolean().optional(),
      color: colorSchema,
      comments: commentsSchema,
      tags: tagsSchema,
      ignore_warnings: ignoreWarningsSchema,
      ignore_errors: ignoreErrorsSchema,
      raw_payload: rawPayloadSchema,
      domain: domainSchema,
    },
    async (args: Record<string, unknown>, extra: any) => {
      if (!args.name && !args.uid) {
        throw new Error('Either name or uid must be provided.');
      }
      if (
        !requireMutableFields(args, [
          'is_sub_domain',
          'color',
          'comments',
          'tags',
          'ignore_warnings',
          'ignore_errors',
          'raw_payload',
        ])
      ) {
        throw new Error('Provide at least one field to update.');
      }

      const payload = {
        ...pickDefinedEntries({ name: args.name, uid: args.uid }),
        ...buildCommonPayload(args),
        ...pickDefinedEntries({
          'is-sub-domain': args.is_sub_domain,
        }),
        ...(args.raw_payload as Record<string, unknown> | undefined),
      };

      return runMutation(serverModule, extra, 'set-dns-domain', payload, getDomain(args), 'set_dns_domain', {
        type: 'dns-domain',
        name: args.name as string | undefined,
        uid: args.uid as string | undefined,
      });
    }
  );

  server.tool(
    'add_group',
    'Create a group object in the current management session draft.',
    {
      name: nameSchema,
      members: z.array(z.string().trim().min(1)).optional(),
      color: colorSchema,
      comments: commentsSchema,
      tags: tagsSchema,
      ignore_warnings: ignoreWarningsSchema,
      ignore_errors: ignoreErrorsSchema,
      raw_payload: rawPayloadSchema,
      domain: domainSchema,
    },
    async (args: Record<string, unknown>, extra: any) => {
      const payload = {
        name: args.name,
        ...buildCommonPayload(args),
        ...pickDefinedEntries({
          members: args.members,
        }),
        ...(args.raw_payload as Record<string, unknown> | undefined),
      };

      return runMutation(serverModule, extra, 'add-group', payload, getDomain(args), 'add_group', {
        type: 'group',
        name: args.name as string,
      });
    }
  );

  server.tool(
    'set_group',
    'Update a group object in the current management session draft.',
    {
      name: nameSchema.optional(),
      uid: uidSchema.optional(),
      members: z.array(z.string().trim().min(1)).optional(),
      color: colorSchema,
      comments: commentsSchema,
      tags: tagsSchema,
      ignore_warnings: ignoreWarningsSchema,
      ignore_errors: ignoreErrorsSchema,
      raw_payload: rawPayloadSchema,
      domain: domainSchema,
    },
    async (args: Record<string, unknown>, extra: any) => {
      if (!args.name && !args.uid) {
        throw new Error('Either name or uid must be provided.');
      }
      if (
        !requireMutableFields(args, [
          'members',
          'color',
          'comments',
          'tags',
          'ignore_warnings',
          'ignore_errors',
          'raw_payload',
        ])
      ) {
        throw new Error('Provide at least one field to update.');
      }

      const payload = {
        ...pickDefinedEntries({ name: args.name, uid: args.uid }),
        ...buildCommonPayload(args),
        ...pickDefinedEntries({
          members: args.members,
        }),
        ...(args.raw_payload as Record<string, unknown> | undefined),
      };

      return runMutation(serverModule, extra, 'set-group', payload, getDomain(args), 'set_group', {
        type: 'group',
        name: args.name as string | undefined,
        uid: args.uid as string | undefined,
      });
    }
  );

  for (const [toolPrefix, uriBase, fieldSchema] of [
    ['service_tcp', 'service-tcp', { port: z.string().trim().min(1), source_port: z.string().trim().min(1).optional() }],
    ['service_udp', 'service-udp', { port: z.string().trim().min(1), source_port: z.string().trim().min(1).optional() }],
  ] as const) {
    server.tool(
      `add_${toolPrefix}`,
      `Create a ${uriBase} object in the current management session draft.`,
      {
        name: nameSchema,
        ...fieldSchema,
        color: colorSchema,
        comments: commentsSchema,
        tags: tagsSchema,
        ignore_warnings: ignoreWarningsSchema,
        ignore_errors: ignoreErrorsSchema,
        raw_payload: rawPayloadSchema,
        domain: domainSchema,
      },
      async (args: Record<string, unknown>, extra: any) => {
        const payload = {
          name: args.name,
          ...buildCommonPayload(args),
          ...pickDefinedEntries({
            port: args.port,
            'source-port': args.source_port,
          }),
          ...(args.raw_payload as Record<string, unknown> | undefined),
        };

        return runMutation(
          serverModule,
          extra,
          `add-${uriBase}`,
          payload,
          getDomain(args),
          `add_${toolPrefix}`,
          { type: uriBase, name: args.name as string }
        );
      }
    );

    server.tool(
      `set_${toolPrefix}`,
      `Update a ${uriBase} object in the current management session draft.`,
      {
        name: nameSchema.optional(),
        uid: uidSchema.optional(),
        port: z.string().trim().min(1).optional(),
        source_port: z.string().trim().min(1).optional(),
        color: colorSchema,
        comments: commentsSchema,
        tags: tagsSchema,
        ignore_warnings: ignoreWarningsSchema,
        ignore_errors: ignoreErrorsSchema,
        raw_payload: rawPayloadSchema,
        domain: domainSchema,
      },
      async (args: Record<string, unknown>, extra: any) => {
        if (!args.name && !args.uid) {
          throw new Error('Either name or uid must be provided.');
        }
        if (
          !requireMutableFields(args, [
            'port',
            'source_port',
            'color',
            'comments',
            'tags',
            'ignore_warnings',
            'ignore_errors',
            'raw_payload',
          ])
        ) {
          throw new Error('Provide at least one field to update.');
        }

        const payload = {
          ...pickDefinedEntries({ name: args.name, uid: args.uid }),
          ...buildCommonPayload(args),
          ...pickDefinedEntries({
            port: args.port,
            'source-port': args.source_port,
          }),
          ...(args.raw_payload as Record<string, unknown> | undefined),
        };

        return runMutation(
          serverModule,
          extra,
          `set-${uriBase}`,
          payload,
          getDomain(args),
          `set_${toolPrefix}`,
          {
            type: uriBase,
            name: args.name as string | undefined,
            uid: args.uid as string | undefined,
          }
        );
      }
    );
  }

  for (const [toolPrefix, uriBase] of [
    ['service_icmp', 'service-icmp'],
    ['service_icmp6', 'service-icmp6'],
  ] as const) {
    server.tool(
      `add_${toolPrefix}`,
      `Create a ${uriBase} object in the current management session draft.`,
      {
        name: nameSchema,
        icmp_type: z.number().int().optional(),
        icmp_code: z.number().int().optional(),
        color: colorSchema,
        comments: commentsSchema,
        tags: tagsSchema,
        ignore_warnings: ignoreWarningsSchema,
        ignore_errors: ignoreErrorsSchema,
        raw_payload: rawPayloadSchema,
        domain: domainSchema,
      },
      async (args: Record<string, unknown>, extra: any) => {
        const payload = {
          name: args.name,
          ...buildCommonPayload(args),
          ...pickDefinedEntries({
            'icmp-type': args.icmp_type,
            'icmp-code': args.icmp_code,
          }),
          ...(args.raw_payload as Record<string, unknown> | undefined),
        };

        return runMutation(
          serverModule,
          extra,
          `add-${uriBase}`,
          payload,
          getDomain(args),
          `add_${toolPrefix}`,
          { type: uriBase, name: args.name as string }
        );
      }
    );

    server.tool(
      `set_${toolPrefix}`,
      `Update a ${uriBase} object in the current management session draft.`,
      {
        name: nameSchema.optional(),
        uid: uidSchema.optional(),
        icmp_type: z.number().int().optional(),
        icmp_code: z.number().int().optional(),
        color: colorSchema,
        comments: commentsSchema,
        tags: tagsSchema,
        ignore_warnings: ignoreWarningsSchema,
        ignore_errors: ignoreErrorsSchema,
        raw_payload: rawPayloadSchema,
        domain: domainSchema,
      },
      async (args: Record<string, unknown>, extra: any) => {
        if (!args.name && !args.uid) {
          throw new Error('Either name or uid must be provided.');
        }
        if (
          !requireMutableFields(args, [
            'icmp_type',
            'icmp_code',
            'color',
            'comments',
            'tags',
            'ignore_warnings',
            'ignore_errors',
            'raw_payload',
          ])
        ) {
          throw new Error('Provide at least one field to update.');
        }

        const payload = {
          ...pickDefinedEntries({ name: args.name, uid: args.uid }),
          ...buildCommonPayload(args),
          ...pickDefinedEntries({
            'icmp-type': args.icmp_type,
            'icmp-code': args.icmp_code,
          }),
          ...(args.raw_payload as Record<string, unknown> | undefined),
        };

        return runMutation(
          serverModule,
          extra,
          `set-${uriBase}`,
          payload,
          getDomain(args),
          `set_${toolPrefix}`,
          {
            type: uriBase,
            name: args.name as string | undefined,
            uid: args.uid as string | undefined,
          }
        );
      }
    );
  }

  for (const [toolPrefix, uriBase] of [
    ['tag', 'tag'],
    ['security_zone', 'security-zone'],
  ] as const) {
    server.tool(
      `add_${toolPrefix}`,
      `Create a ${uriBase} object in the current management session draft.`,
      {
        name: nameSchema,
        color: colorSchema,
        comments: commentsSchema,
        tags: tagsSchema,
        ignore_warnings: ignoreWarningsSchema,
        ignore_errors: ignoreErrorsSchema,
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
          `add-${uriBase}`,
          payload,
          getDomain(args),
          `add_${toolPrefix}`,
          { type: uriBase, name: args.name as string }
        );
      }
    );

    server.tool(
      `set_${toolPrefix}`,
      `Update a ${uriBase} object in the current management session draft.`,
      {
        name: nameSchema.optional(),
        uid: uidSchema.optional(),
        color: colorSchema,
        comments: commentsSchema,
        tags: tagsSchema,
        ignore_warnings: ignoreWarningsSchema,
        ignore_errors: ignoreErrorsSchema,
        raw_payload: rawPayloadSchema,
        domain: domainSchema,
      },
      async (args: Record<string, unknown>, extra: any) => {
        if (!args.name && !args.uid) {
          throw new Error('Either name or uid must be provided.');
        }
        if (
          !requireMutableFields(args, [
            'color',
            'comments',
            'tags',
            'ignore_warnings',
            'ignore_errors',
            'raw_payload',
          ])
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
          `set-${uriBase}`,
          payload,
          getDomain(args),
          `set_${toolPrefix}`,
          {
            type: uriBase,
            name: args.name as string | undefined,
            uid: args.uid as string | undefined,
          }
        );
      }
    );
  }

  if (destroyEnabled) {
    for (const [toolPrefix, uriBase] of [
      ['host', 'host'],
      ['network', 'network'],
      ['address_range', 'address-range'],
      ['dns_domain', 'dns-domain'],
      ['group', 'group'],
      ['service_tcp', 'service-tcp'],
      ['service_udp', 'service-udp'],
      ['service_icmp', 'service-icmp'],
      ['service_icmp6', 'service-icmp6'],
      ['tag', 'tag'],
      ['security_zone', 'security-zone'],
    ] as const) {
      server.tool(
        `delete_${toolPrefix}`,
        `Delete a ${uriBase} object from the current management session draft.`,
        {
          name: nameSchema.optional(),
          uid: uidSchema.optional(),
          ignore_warnings: ignoreWarningsSchema,
          ignore_errors: ignoreErrorsSchema,
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
  }

  server.tool(
    'add_package',
    'Create a policy package in the current management session draft.',
    {
      name: nameSchema,
      comments: commentsSchema,
      color: colorSchema,
      tags: tagsSchema,
      ignore_warnings: ignoreWarningsSchema,
      ignore_errors: ignoreErrorsSchema,
      raw_payload: rawPayloadSchema,
      domain: domainSchema,
    },
    async (args: Record<string, unknown>, extra: any) => {
      const payload = {
        name: args.name,
        ...buildCommonPayload(args),
        ...(args.raw_payload as Record<string, unknown> | undefined),
      };
      return runMutation(serverModule, extra, 'add-package', payload, getDomain(args), 'add_package', {
        type: 'package',
        name: args.name as string,
      });
    }
  );

  server.tool(
    'set_package',
    'Update a policy package in the current management session draft.',
    {
      name: nameSchema.optional(),
      uid: uidSchema.optional(),
      comments: commentsSchema,
      color: colorSchema,
      tags: tagsSchema,
      ignore_warnings: ignoreWarningsSchema,
      ignore_errors: ignoreErrorsSchema,
      raw_payload: rawPayloadSchema,
      domain: domainSchema,
    },
    async (args: Record<string, unknown>, extra: any) => {
      if (
        !requireMutableFields(args, [
          'comments',
          'color',
          'tags',
          'ignore_warnings',
          'ignore_errors',
          'raw_payload',
        ])
      ) {
        throw new Error('Provide at least one field to update.');
      }

      const payload = {
        ...getRequiredNameOrUid(args),
        ...buildCommonPayload(args),
        ...(args.raw_payload as Record<string, unknown> | undefined),
      };
      return runMutation(serverModule, extra, 'set-package', payload, getDomain(args), 'set_package', {
        type: 'package',
        name: args.name as string | undefined,
        uid: args.uid as string | undefined,
      });
    }
  );

  if (destroyEnabled) {
    server.tool(
      'delete_package',
      'Delete a policy package from the current management session draft.',
      {
        name: nameSchema.optional(),
        uid: uidSchema.optional(),
        ignore_warnings: ignoreWarningsSchema,
        ignore_errors: ignoreErrorsSchema,
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
        return runMutation(serverModule, extra, 'delete-package', payload, getDomain(args), 'delete_package', {
          type: 'package',
          name: args.name as string | undefined,
          uid: args.uid as string | undefined,
        });
      }
    );
  }

  server.tool(
    'install_policy',
    'Install a policy package explicitly. This is never done automatically.',
    {
      policy_package: z.string().trim().min(1).optional(),
      targets: z.array(z.string().trim().min(1)).optional(),
      access: z.boolean().optional(),
      threat_prevention: z.boolean().optional(),
      raw_payload: rawPayloadSchema,
      domain: domainSchema,
    },
    async (args: Record<string, unknown>, extra: any) => {
      assertNoRawPayloadConflicts(args, { policy_package: 'policy-package' });
      const payload = {
        ...pickDefinedEntries({
          'policy-package': args.policy_package,
          targets: args.targets,
          access: args.access,
          'threat-prevention': args.threat_prevention,
        }),
        ...(args.raw_payload as Record<string, unknown> | undefined),
      };
      if (Object.keys(payload).length === 0) {
        throw new Error('Provide policy_package, targets, raw_payload, or other install-policy fields.');
      }
      return runMutation(
        serverModule,
        extra,
        'install-policy',
        payload,
        getDomain(args),
        'install_policy',
        {
          type: 'policy-package',
          name: args.policy_package as string | undefined,
        },
        buildNextStepHints({
          notes: ['Policy installation is explicit and was triggered by this tool call.'],
        })
      );
    }
  );

  for (const [toolPrefix, uriBase] of [
    ['access_layer', 'access-layer'],
    ['access_rule', 'access-rule'],
    ['nat_rule', 'nat-rule'],
  ] as const) {
    server.tool(
      `add_${toolPrefix}`,
      `Create a ${uriBase} item in the current management session draft.`,
      {
        name: nameSchema.optional(),
        layer: z.string().trim().min(1).optional(),
        package: z.string().trim().min(1).optional(),
        rule_number: z.union([z.string().trim().min(1), z.number().int().positive()]).optional(),
        comments: commentsSchema,
        enabled: z.boolean().optional(),
        action: z.string().trim().min(1).optional(),
        source: z.array(z.string().trim().min(1)).optional(),
        destination: z.array(z.string().trim().min(1)).optional(),
        service: z.array(z.string().trim().min(1)).optional(),
        position: z.string().trim().min(1).optional(),
        ignore_warnings: ignoreWarningsSchema,
        ignore_errors: ignoreErrorsSchema,
        raw_payload: rawPayloadSchema,
        domain: domainSchema,
      },
      async (args: Record<string, unknown>, extra: any) => {
        const payload = {
          ...pickDefinedEntries({
            name: args.name,
            layer: args.layer,
            package: args.package,
            'rule-number': args.rule_number,
            comments: args.comments,
            enabled: args.enabled,
            action: args.action,
            source: args.source,
            destination: args.destination,
            service: args.service,
            position: args.position,
            'ignore-warnings': args.ignore_warnings,
            'ignore-errors': args.ignore_errors,
          }),
          ...(args.raw_payload as Record<string, unknown> | undefined),
        };
        if (Object.keys(payload).length === 0) {
          throw new Error('Provide write fields or raw_payload.');
        }
        return runMutation(
          serverModule,
          extra,
          `add-${uriBase}`,
          payload,
          getDomain(args),
          `add_${toolPrefix}`,
          {
            type: uriBase,
            name: args.name as string | undefined,
            layer: args.layer as string | undefined,
            package: args.package as string | undefined,
            ruleNumber: args.rule_number as string | number | undefined,
          }
        );
      }
    );

    server.tool(
      `set_${toolPrefix}`,
      `Update a ${uriBase} item in the current management session draft.`,
      {
        name: nameSchema.optional(),
        uid: uidSchema.optional(),
        layer: z.string().trim().min(1).optional(),
        package: z.string().trim().min(1).optional(),
        rule_number: z.union([z.string().trim().min(1), z.number().int().positive()]).optional(),
        comments: commentsSchema,
        enabled: z.boolean().optional(),
        action: z.string().trim().min(1).optional(),
        source: z.array(z.string().trim().min(1)).optional(),
        destination: z.array(z.string().trim().min(1)).optional(),
        service: z.array(z.string().trim().min(1)).optional(),
        position: z.string().trim().min(1).optional(),
        ignore_warnings: ignoreWarningsSchema,
        ignore_errors: ignoreErrorsSchema,
        raw_payload: rawPayloadSchema,
        domain: domainSchema,
      },
      async (args: Record<string, unknown>, extra: any) => {
        if (!args.name && !args.uid && args.rule_number === undefined) {
          throw new Error('Provide name, uid, or rule_number.');
        }
        const payload = {
          ...pickDefinedEntries({
            name: args.name,
            uid: args.uid,
            layer: args.layer,
            package: args.package,
            'rule-number': args.rule_number,
            comments: args.comments,
            enabled: args.enabled,
            action: args.action,
            source: args.source,
            destination: args.destination,
            service: args.service,
            position: args.position,
            'ignore-warnings': args.ignore_warnings,
            'ignore-errors': args.ignore_errors,
          }),
          ...(args.raw_payload as Record<string, unknown> | undefined),
        };
        return runMutation(
          serverModule,
          extra,
          `set-${uriBase}`,
          payload,
          getDomain(args),
          `set_${toolPrefix}`,
          {
            type: uriBase,
            name: args.name as string | undefined,
            uid: args.uid as string | undefined,
            layer: args.layer as string | undefined,
            package: args.package as string | undefined,
            ruleNumber: args.rule_number as string | number | undefined,
          }
        );
      }
    );

    if (destroyEnabled) {
      server.tool(
        `delete_${toolPrefix}`,
        `Delete a ${uriBase} item from the current management session draft.`,
        {
          name: nameSchema.optional(),
          uid: uidSchema.optional(),
          layer: z.string().trim().min(1).optional(),
          package: z.string().trim().min(1).optional(),
          rule_number: z.union([z.string().trim().min(1), z.number().int().positive()]).optional(),
          ignore_warnings: ignoreWarningsSchema,
          ignore_errors: ignoreErrorsSchema,
          raw_payload: rawPayloadSchema,
          domain: domainSchema,
        },
        async (args: Record<string, unknown>, extra: any) => {
          if (!args.name && !args.uid && args.rule_number === undefined) {
            throw new Error('Provide name, uid, or rule_number.');
          }
          const payload = {
            ...pickDefinedEntries({
              name: args.name,
              uid: args.uid,
              layer: args.layer,
              package: args.package,
              'rule-number': args.rule_number,
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
              layer: args.layer as string | undefined,
              package: args.package as string | undefined,
              ruleNumber: args.rule_number as string | number | undefined,
            }
          );
        }
      );
    }
  }

  server.tool(
    'management__write_command',
    destroyEnabled
      ? 'Execute an explicit write-oriented management API command such as add-*, set-*, delete-*, publish, discard, or install-policy.'
      : 'Execute an explicit write-oriented management API command such as add-*, set-*, publish, discard, or install-policy. Delete commands require destroy access.',
    {
      command: commandSchema,
      payload: z.record(z.unknown()).optional(),
      domain: domainSchema,
    },
    async (args: Record<string, unknown>, extra: any) => {
      const command = args.command as string;
      const normalizedCommand = command.trim().toLowerCase();
      const payload = (args.payload as Record<string, unknown> | undefined) ?? {};
      return runWriteCommand(
        serverModule,
        extra,
        command,
        payload,
        getDomain(args),
        'management__write_command',
        {
          allowDelete: destroyEnabled,
        },
        {
          type: normalizedCommand,
        },
        normalizedCommand === 'install-policy'
          ? buildNextStepHints({
              notes: ['This generic write command explicitly triggered a policy install request.'],
            })
          : buildNextStepHints({ publish: normalizedCommand !== 'publish' && normalizedCommand !== 'discard' })
      );
    }
  );
}
