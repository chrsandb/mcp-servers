import config from './server-config.json';

describe('management server config', () => {
  test('declares write access as disabled by default', () => {
    const option = config.options.find((entry) => entry.env === 'ENABLE_WRITE');

    expect(option).toMatchObject({
      flag: '--enable-write',
      env: 'ENABLE_WRITE',
      default: 'false',
      type: 'boolean',
    });
  });
});
