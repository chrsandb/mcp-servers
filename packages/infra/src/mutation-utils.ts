import { readFileSync } from 'fs';

export const ENABLE_WRITE_ENV_VAR = 'ENABLE_WRITE';

export type WriteEnableOption = {
  flag?: string;
  env?: string;
  default?: string | boolean;
  type?: string;
};

export type WriteEnableConfig = {
  options?: WriteEnableOption[];
};

export type MutationTarget = {
  type?: string;
  name?: string;
  uid?: string;
  layer?: string;
  ruleNumber?: string | number;
};

export type MutationResultOptions = {
  success?: boolean;
  action: string;
  target?: MutationTarget;
  response: Record<string, any>;
  nextSteps?: string[];
};

export type WriteCommandOptions = {
  allowInstallPolicy?: boolean;
};

export function pickDefinedEntries(input: Record<string, any>): Record<string, any> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  );
}

export function loadWriteEnableConfig(configPath: string): WriteEnableConfig | undefined {
  try {
    return JSON.parse(readFileSync(configPath, 'utf8')) as WriteEnableConfig;
  } catch {
    return undefined;
  }
}

function findEnableWriteOption(config?: WriteEnableConfig): WriteEnableOption | undefined {
  return config?.options?.find((option) => option.env === ENABLE_WRITE_ENV_VAR);
}

function strictTrue(value: unknown): boolean {
  return typeof value === 'string' && value.trim().toLowerCase() === 'true';
}

function argvHasFlag(flag: string | undefined, argv: string[]): boolean {
  if (!flag) {
    return false;
  }

  const flagName = flag.split(/\s+/)[0];
  return argv.includes(flagName);
}

export function isWriteEnabled(
  config?: WriteEnableConfig,
  env: Record<string, string | undefined> = process.env,
  argv: string[] = process.argv
): boolean {
  const option = findEnableWriteOption(config);
  if (!option) {
    return false;
  }

  const envName = option.env ?? ENABLE_WRITE_ENV_VAR;
  return strictTrue(env[envName]) || argvHasFlag(option.flag, argv);
}

export function assertWriteCommand(command: string, options?: WriteCommandOptions): string {
  const normalized = command.trim().toLowerCase();

  if (!/^[a-z][a-z0-9-]*$/.test(normalized)) {
    throw new Error(
      'Command must contain only lowercase letters, digits, and hyphens, for example set-host or add-network.'
    );
  }

  const allowedCommands = new Set(['publish', 'discard']);
  if (options?.allowInstallPolicy) {
    allowedCommands.add('install-policy');
  }

  const allowedPrefixes = ['add-', 'set-', 'delete-'];

  if (allowedCommands.has(normalized) || allowedPrefixes.some((prefix) => normalized.startsWith(prefix))) {
    return normalized;
  }

  const allowedText = options?.allowInstallPolicy
    ? 'add-*, set-*, delete-*, publish, discard, or install-policy'
    : 'add-*, set-*, delete-*, publish, or discard';
  throw new Error(`Only explicit write-oriented commands are allowed. Use ${allowedText}.`);
}

export function assertNoRawPayloadConflicts(
  args: Record<string, unknown>,
  protectedKeys: Record<string, string> | string[]
): void {
  const rawPayload = args.raw_payload;
  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
    return;
  }

  const raw = rawPayload as Record<string, unknown>;
  const keyMap = Array.isArray(protectedKeys)
    ? Object.fromEntries(protectedKeys.map((key) => [key, key]))
    : protectedKeys;

  for (const [argKey, rawKey] of Object.entries(keyMap)) {
    if (args[argKey] !== undefined && rawKey in raw) {
      throw new Error(`raw_payload must not override ${rawKey} when ${argKey} is provided as a named field.`);
    }
  }
}

export function buildNextStepHints(options?: {
  publish?: boolean;
  install?: boolean;
  notes?: string[];
}): string[] {
  const hints: string[] = [];

  if (options?.publish) {
    hints.push('Changes are still in the current session draft until you call publish_session.');
  }

  if (options?.install) {
    hints.push('Installing policy is a separate step and is not performed automatically.');
  }

  if (options?.notes) {
    hints.push(...options.notes);
  }

  return hints;
}

function formatTarget(target?: MutationTarget): string | undefined {
  if (!target) {
    return undefined;
  }

  const parts = [
    target.type,
    target.name ? `name=${target.name}` : undefined,
    target.uid ? `uid=${target.uid}` : undefined,
    target.layer ? `layer=${target.layer}` : undefined,
    target.ruleNumber !== undefined ? `rule_number=${target.ruleNumber}` : undefined,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(', ') : undefined;
}

export function formatMutationResult(options: MutationResultOptions): string {
  const payload = {
    success: options.success ?? true,
    action: options.action,
    target: formatTarget(options.target),
    uid: options.response.uid,
    name: options.response.name,
    task_id: options.response['task-id'],
    next_steps: options.nextSteps ?? [],
    response: options.response,
  };

  return JSON.stringify(payload, null, 2);
}
