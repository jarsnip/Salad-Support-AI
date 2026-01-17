import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const commands = [
  {
    name: 'end',
    description: 'End the support conversation and provide feedback',
  },
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

async function registerCommands() {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
      { body: commands },
    );

    console.log('Successfully reloaded application (/) commands.');
    console.log('Registered commands:', commands.map(c => `/${c.name}`).join(', '));
  } catch (error) {
    console.error('Error registering commands:', error);
  }
}

registerCommands();
