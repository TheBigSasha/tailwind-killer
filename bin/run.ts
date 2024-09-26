import yargs, { CommandModule } from 'yargs'
import { config } from 'dotenv'
import { command } from '../src/commands/index'
import { bgBlue, bold, red } from 'picocolors'

config()

const run = yargs(process.argv.slice(2))
run.usage(
  bgBlue(
    `Welcome to ${bold(red('Tailwind Killer'))}!
    See more on https://github.com/thebigsasha/tailwind-killer`,
  ),
)

run.command(command as CommandModule)

void run.demandCommand(1, 'You need at least one command before moving on').help().argv;