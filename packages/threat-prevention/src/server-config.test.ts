import config from './server-config.json';

describe('threat prevention server config', () => {
  test('declares write access as disabled by default', () => {
    const option = config.options.find((entry) => entry.env === 'ENABLE_WRITE');

    expect(option).toMatchObject({
      flag: '--enable-write',
      env: 'ENABLE_WRITE',
      default: 'false',
      type: 'boolean',
    });
  });

  test('declares destroy access as disabled by default', () => {
    const option = config.options.find((entry) => entry.env === 'ENABLE_DESTROY');

    expect(option).toMatchObject({
      flag: '--enable-destroy',
      env: 'ENABLE_DESTROY',
      default: 'false',
      type: 'boolean',
    });
  });
});
