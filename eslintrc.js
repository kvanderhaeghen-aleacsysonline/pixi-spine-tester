module.exports = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 2018,
        sourceType: 'module',
        tsconfigRootDir: 'build/',
        project: ['tsconfig.all.json'],
    },
    env: {
        node: true,
        commonjs: true,
        browser: true,
        es6: true,
        es2017: true,
    },
    extends: [
        'eslint:recommended', // Default recommended rules
        'plugin:@typescript-eslint/eslint-plugin/eslint-recommended', // Adjust default rules for typescript support
        'plugin:@typescript-eslint/eslint-plugin/recommended', // Default typescript rules
        'plugin:@typescript-eslint/eslint-plugin/recommended-requiring-type-checking', // Enable typescript typechecking
        'plugin:eslint-plugin-prettier/recommended', // Enable prettier support
        'eslint-config-prettier/@typescript-eslint', // Enable prettier typescript rules
    ],
    rules: {
        'no-async-promise-executor': 'off',
        'no-prototype-builtins': 'off',
        'prettier/prettier': ['error', JSON.parse(require('fs').readFileSync('build/prettierrc.json'))],
        '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
        '@typescript-eslint/interface-name-prefix': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        '@typescript-eslint/no-empty-interface': 'off',
    },
};
