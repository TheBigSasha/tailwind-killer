import { CommandModule } from 'yargs';
import killtw from './killtw';

export const command: CommandModule = {
  ...killtw,
  command: '$0',
};