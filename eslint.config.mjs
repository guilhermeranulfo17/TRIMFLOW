import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'next-env.d.ts',
      'playwright-report/**',
      'test-results/**',
      'supabase/.temp/**',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // Regra de ouro: o domínio é puro. Nada de banco, React, Next ou servidor.
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'next', 'next/*'],
              message: 'src/domain deve ser puro (sem React/Next).',
            },
            {
              group: ['@/server/*', '@/app/*', '@/components/*', '@/lib/*'],
              message: 'src/domain não depende de outras camadas.',
            },
            {
              group: ['drizzle-orm', 'drizzle-orm/*', 'postgres', '@supabase/*'],
              message: 'src/domain não acessa banco.',
            },
          ],
        },
      ],
    },
  },
  {
    // Código de cliente nunca importa acesso administrativo ao banco.
    files: ['src/components/**/*.tsx', 'src/lib/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/server/db/*'], message: 'Componentes não acessam o banco diretamente.' },
          ],
        },
      ],
    },
  },
];

export default config;
