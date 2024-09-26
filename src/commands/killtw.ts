import { CommandModule } from 'yargs';
import { consola } from 'consola';
import { TailwindKiller, TailwindKillerConfig } from '../killtailwind';

const killtwCommand: CommandModule = {
  command: 'killtw',
  describe: 'Convert Tailwind CSS classes to regular CSS',
  builder: (yargs) => {
    return yargs
      .option('rootDir', {
        type: 'string',
        describe: 'Root directory to start processing files',
        default: process.cwd(),
      })
      .option('lockfilePath', {
        type: 'string',
        describe: 'Path to the lockfile',
        default: './tailwind-killer-lockfile.json',
      })
      .option('orderMatters', {
        type: 'boolean',
        describe: 'Whether the order of classes matters',
        default: false,
      })
      .option('scannedFileTypes', {
        type: 'array',
        describe: 'File types to scan',
        default: ['.astro', '.tsx', '.jsx', '.vue', '.html'],
      })
      .option('maxLLMInvocations', {
        type: 'number',
        describe: 'Maximum number of LLM invocations',
        default: 999,
      })
      .option('prefix', {
        type: 'string',
        describe: 'Prefix for generated class names',
        default: 'twk-',
      })
      .option('openaiApiUrl', {
        type: 'string',
        describe: 'OpenAI API URL',
        default: 'http://localhost:8787',
      })
      .option('excludedDirectories', {
        type: 'array',
        describe: 'Directories to exclude',
        default: ['node_modules', 'dist', '.git'],
      })
      .option('useLLM', {
        type: 'boolean',
        describe: 'Whether to use LLM for class name generation',
        default: true,
      });
  },
  handler: async (argv) => {
    const config: TailwindKillerConfig = {
      orderMatters: argv.orderMatters as boolean,
      scannedFileTypes: argv.scannedFileTypes as string[],
      maxLLMInvocations: argv.maxLLMInvocations as number,
      prefix: argv.prefix as string,
      openaiApiUrl: argv.openaiApiUrl as string,
      tailwindOptions: {
        // Add any Tailwind options here
      },
      excludedDirectories: argv.excludedDirectories as string[],
      lockfilePath: argv.lockfilePath as string,
      useLLM: argv.useLLM as boolean,
    };

    const tailwindKiller = new TailwindKiller(config);

    consola.start('Starting Tailwind Killer');
    consola.info(`Root directory: ${argv.rootDir}`);
    consola.info(`Lockfile path: ${argv.lockfilePath}`);

    try {
      await tailwindKiller.run(argv.rootDir as string, argv.lockfilePath as string);
      consola.success('Tailwind Killer completed successfully');
    } catch (error) {
      consola.error('An error occurred during execution:');
      consola.error(error);
      process.exit(1);
    }
  },
};

export default killtwCommand;