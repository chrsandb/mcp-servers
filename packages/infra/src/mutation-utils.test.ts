import {
  assertNoRawPayloadConflicts,
  assertWriteCommand,
  buildNextStepHints,
  formatMutationResult,
  isWriteEnabled,
  pickDefinedEntries,
} from './mutation-utils';
import { sanitizeData } from './string-utils';

describe('mutation-utils', () => {
  test('pickDefinedEntries removes undefined values and preserves other entries', () => {
    expect(
      pickDefinedEntries({
        name: 'example',
        uid: undefined,
        enabled: false,
        count: 0,
      })
    ).toEqual({
      name: 'example',
      enabled: false,
      count: 0,
    });
  });

  test('buildNextStepHints includes explicit publish/install guidance and notes', () => {
    expect(
      buildNextStepHints({
        publish: true,
        install: true,
        notes: ['Custom note'],
      })
    ).toEqual([
      'Changes are still in the current session draft until you call publish_session.',
      'Installing policy is a separate step and is not performed automatically.',
      'Custom note',
    ]);
  });

  test('formatMutationResult returns stable formatted mutation output', () => {
    const text = formatMutationResult({
      action: 'set_host',
      target: {
        type: 'host',
        name: 'web-01',
        uid: '123',
      },
      response: {
        uid: '123',
        name: 'web-01',
        'task-id': 'task-1',
        status: 'ok',
      },
      nextSteps: ['Publish the session.'],
    });

    expect(JSON.parse(text)).toEqual({
      success: true,
      action: 'set_host',
      target: 'host, name=web-01, uid=123',
      uid: '123',
      name: 'web-01',
      task_id: 'task-1',
      next_steps: ['Publish the session.'],
      response: {
        uid: '123',
        name: 'web-01',
        'task-id': 'task-1',
        status: 'ok',
      },
    });
  });

  test('formatMutationResult allows explicit unsuccessful results', () => {
    const text = formatMutationResult({
      success: false,
      action: 'add_threat_profile',
      response: {
        'task-id': 'task-1',
      },
    });

    expect(JSON.parse(text)).toMatchObject({
      success: false,
      action: 'add_threat_profile',
      task_id: 'task-1',
    });
  });

  test('assertWriteCommand normalizes safe write commands', () => {
    expect(assertWriteCommand(' SET-HOST ')).toBe('set-host');
    expect(assertWriteCommand('install-policy', { allowInstallPolicy: true })).toBe('install-policy');
  });

  test('assertWriteCommand rejects path traversal and disallowed commands', () => {
    expect(() => assertWriteCommand('set-host/../../../other')).toThrow(
      'Command must contain only lowercase letters, digits, and hyphens'
    );
    expect(() => assertWriteCommand('show-host')).toThrow('Only explicit write-oriented commands are allowed.');
    expect(() => assertWriteCommand('install-policy')).toThrow('Only explicit write-oriented commands are allowed.');
  });

  test('assertNoRawPayloadConflicts rejects protected raw payload overrides', () => {
    expect(() =>
      assertNoRawPayloadConflicts(
        {
          name: 'expected-name',
          raw_payload: { name: 'other-name' },
        },
        ['name']
      )
    ).toThrow('raw_payload must not override name');

    expect(() =>
      assertNoRawPayloadConflicts(
        {
          rule_number: 1,
          raw_payload: { 'rule-number': 2 },
        },
        { rule_number: 'rule-number' }
      )
    ).toThrow('raw_payload must not override rule-number');
  });

  test('isWriteEnabled is disabled when config or explicit true value is missing', () => {
    const config = {
      options: [
        {
          flag: '--enable-write',
          env: 'ENABLE_WRITE',
          default: 'false',
          type: 'boolean',
        },
      ],
    };

    expect(isWriteEnabled(undefined, { ENABLE_WRITE: 'true' }, ['node'])).toBe(false);
    expect(isWriteEnabled({ options: [] }, { ENABLE_WRITE: 'true' }, ['node'])).toBe(false);
    expect(isWriteEnabled(config, {}, ['node'])).toBe(false);
    expect(isWriteEnabled(config, { ENABLE_WRITE: 'false' }, ['node'])).toBe(false);
    expect(isWriteEnabled(config, { ENABLE_WRITE: '1' }, ['node'])).toBe(false);
    expect(isWriteEnabled(config, { ENABLE_WRITE: 'yes' }, ['node'])).toBe(false);
    expect(isWriteEnabled(config, { ENABLE_WRITE: 'on' }, ['node'])).toBe(false);
    expect(isWriteEnabled(config, { ENABLE_WRITE: '' }, ['node'])).toBe(false);
  });

  test('isWriteEnabled accepts strict true env values and configured CLI flag', () => {
    const config = {
      options: [
        {
          flag: '--enable-write',
          env: 'ENABLE_WRITE',
          default: 'false',
          type: 'boolean',
        },
      ],
    };

    expect(isWriteEnabled(config, { ENABLE_WRITE: 'true' }, ['node'])).toBe(true);
    expect(isWriteEnabled(config, { ENABLE_WRITE: 'TRUE' }, ['node'])).toBe(true);
    expect(isWriteEnabled(config, { ENABLE_WRITE: ' true ' }, ['node'])).toBe(true);
    expect(isWriteEnabled(config, {}, ['node', 'server', '--enable-write'])).toBe(true);
  });
});

describe('sanitizeData', () => {
  test('preserves empty arrays and still drops null undefined and empty strings', () => {
    expect(
      sanitizeData({
        members: [],
        tags: ['tag-a'],
        comments: '',
        missing: undefined,
        null_value: null,
      })
    ).toEqual({
      members: [],
      tags: ['tag-a'],
    });
  });
});
