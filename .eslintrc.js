module.exports = {
  root: true,
  extends: 'airbnb-base',
  env: {
    browser: true,
  },
  parser: '@babel/eslint-parser',
  parserOptions: {
    allowImportExportEverywhere: true,
    sourceType: 'module',
    requireConfigFile: false,
  },
  rules: {
    // allow reassigning param
    'no-param-reassign': [2, { props: false }],
    'linebreak-style': ['error', 'unix'],
    'import/extensions': ['error', {
      js: 'always',
    }],
  },
  overrides: [
    {
      files: ['test/**/*.js'],
      env: {
        mocha: true,
      },
      rules: {
        'no-console': 'off',
        'no-unused-expressions': 'off',
        'import/no-extraneous-dependencies': 'off',
        camelcase: 'off', // Allow workflow_job from GitHub API
        'no-redeclare': 'off', // Allow test globals
        'no-unused-vars': 'off', // Allow mock function parameters
      },
    },
    {
      files: ['src/**/*.js'],
      rules: {
        'no-console': 'warn',
        'no-use-before-define': 'off',
        camelcase: 'off', // Allow workflow_job from GitHub API
      },
      env: {
        worker: true,
      },
    },
  ],
};
