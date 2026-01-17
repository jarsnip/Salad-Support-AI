import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const commands = [
  {
    name: 'end',
    description: 'End the support conversation and provide feedback',
  },
  {
    name: 'block',
    description: 'Block a user from creating support threads (moderator only)',
    options: [
      {
        name: 'user',
        type: 6, // USER type
        description: 'The user to block',
        required: true
      },
      {
        name: 'reason',
        type: 3, // STRING type
        description: 'Reason for blocking',
        required: false
      }
    ]
  },
  {
    name: 'unblock',
    description: 'Unblock a user from creating support threads (moderator only)',
    options: [
      {
        name: 'user',
        type: 6, // USER type
        description: 'The user to unblock',
        required: true
      }
    ]
  }
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
