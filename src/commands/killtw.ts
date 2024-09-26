import { CommandModule } from 'yargs';
import { consola } from 'consola';
import { TailwindKiller } from '../killtailwind';

export const killtw: CommandModule = {
  command: 'killtw',
  describe: 'Convert Tailwind classes to regular CSS',
  builder: (yargs) => {
    return yargs
      .option('order-matters', {
        type: 'boolean',
        default: false,
        describe: 'Whether the order of classes matters',
      })
      .option('scanned-file-types', {
        type: 'array',
        default: ['.astro', '.tsx', '.jsx', '.vue', '.html'],
        describe: 'File types to scan',
      })
      .option('max-llm-invocations', {
        type: 'number',
        default: 999,
        describe: 'Maximum number of LLM invocations',
      })
      .option('prefix', {
        type: 'string',
        default: 'twk-',
        describe: 'Prefix for generated class names',
      })
      .option('openai-api-url', {
        type: 'string',
        default: 'http://localhost:8787',
        describe: 'OpenAI API URL',
      })
      .option('root-dir', {
        type: 'string',
        default: process.cwd(),
        describe: 'Root directory to start scanning from',
      });
  },
  handler: async (argv) => {
    const tailwindKiller = new TailwindKiller({
      orderMatters: argv['order-matters'] as boolean,
      scannedFileTypes: argv['scanned-file-types'] as string[],
      maxLLMInvocations: argv['max-llm-invocations'] as number,
      prefix: argv.prefix as string,
      openaiApiUrl: argv['openai-api-url'] as string,
      tailwindOptions: {
        ignoreMediaQueries: false,
        experimental: true,
        plugins: [typography],
      },
    });

    consola.start('Starting Tailwind conversion...');
    try {
      await tailwindKiller.run(argv['root-dir'] as string);
      consola.success('Tailwind conversion completed successfully!');
    } catch (error) {
      consola.error('An error occurred during Tailwind conversion:', error);
    }
  },
};