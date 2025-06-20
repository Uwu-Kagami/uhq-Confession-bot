import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder
} from 'discord.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

dotenv.config({ path: './config.env' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const configFilePath = path.join(__dirname, 'data', 'config.json');
if (!fs.existsSync(path.dirname(configFilePath))) fs.mkdirSync(path.dirname(configFilePath));

function loadConfigs() {
  if (!fs.existsSync(configFilePath)) return {};
  try {
    const content = fs.readFileSync(configFilePath, 'utf-8').trim();
    return content ? JSON.parse(content) : {};
  } catch (error) {
    console.error('Erreur de lecture config.json:', error);
    return {};
  }
}

function saveConfig(guildId, data) {
  const configs = loadConfigs();
  configs[guildId] = data;
  fs.writeFileSync(configFilePath, JSON.stringify(configs, null, 2));
}

function getConfig(guildId) {
  const configs = loadConfigs();
  return configs[guildId] || { count: 0, replyCount: 0 };
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

client.once('ready', async () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName('setup')
      .setDescription('Configurer les channels de confessions')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
      .setName('stats')
      .setDescription('Voir les statistiques de confessions')
  ];

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: commands.map(cmd => cmd.toJSON()) }
  );

  console.log('✅ Commandes /setup et /stats enregistrées');
});

client.on('interactionCreate', async interaction => {
  const guildId = interaction.guild?.id;
  if (!guildId) return;

  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'setup') {
      const textChannels = interaction.guild.channels.cache
        .filter(c => c.type === ChannelType.GuildText);

      const options = textChannels.map(c => ({ label: c.name, value: c.id })).slice(0, 25);

      const confessionMenu = new StringSelectMenuBuilder()
        .setCustomId('select_confession')
        .setPlaceholder('Sélectionnez le channel des confessions')
        .addOptions(options);

      const logsMenu = new StringSelectMenuBuilder()
        .setCustomId('select_logs')
        .setPlaceholder('Sélectionnez le channel des logs')
        .addOptions(options);

      await interaction.reply({
        content: 'Choisissez les salons :',
        components: [
          new ActionRowBuilder().addComponents(confessionMenu),
          new ActionRowBuilder().addComponents(logsMenu)
        ],
        flags: 64
      });
    }

    if (interaction.commandName === 'stats') {
      const config = getConfig(guildId);
      const embed = new EmbedBuilder()
        .setTitle(`📊 Statistiques pour ${interaction.guild.name}`)
        .addFields(
          { name: 'Total de confessions', value: config.count.toString(), inline: true },
          { name: 'Total de réponses', value: config.replyCount.toString(), inline: true }
        )
        .setColor('#5865F2')
        .setTimestamp();

      await interaction.reply({ embeds: [embed], flags: 64 });
    }
  }

  if (interaction.isStringSelectMenu()) {
    const config = getConfig(guildId);

    if (interaction.customId === 'select_confession') {
      config.confessionChannelId = interaction.values[0];
      saveConfig(guildId, config);

      const randomColor = `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`;
      const channel = await client.channels.fetch(config.confessionChannelId);
      const embed = new EmbedBuilder()
        .setTitle('🔒 Confessions Anonymes')
        .setDescription('Clique pour soumettre une confession.')
        .setColor(randomColor);

      const submitButton = new ButtonBuilder()
        .setCustomId('open_modal')
        .setLabel('Soumettre une confession')
        .setStyle(ButtonStyle.Primary);

      await channel.send({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(submitButton)]
      });
      await interaction.reply({ content: 'Salon de confession configuré.', flags: 64 });
    }

    if (interaction.customId === 'select_logs') {
      config.logsChannelId = interaction.values[0];
      saveConfig(guildId, config);
      await interaction.reply({ content: 'Salon de logs configuré.', flags: 64 });
    }
  }

  if (interaction.isButton() && interaction.customId === 'open_modal') {
    const modal = new ModalBuilder()
      .setCustomId('submit_confession')
      .setTitle('Soumettre une confession');

    const confessionInput = new TextInputBuilder()
      .setCustomId('confession_text')
      .setLabel('Votre confession')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(confessionInput));
    await interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId === 'submit_confession') {
    const config = getConfig(guildId);
    config.count = (config.count || 0) + 1;
    saveConfig(guildId, config);

    const confessionText = interaction.fields.getTextInputValue('confession_text');
    const confessionChannel = await client.channels.fetch(config.confessionChannelId);
    const logsChannel = await client.channels.fetch(config.logsChannelId);
    const randomColor = `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`;

    const embed = new EmbedBuilder()
      .setAuthor({ name: `📢 Confession Anonyme #${config.count}` })
      .setDescription(`> ${confessionText}`)
      .setColor(randomColor)
      .setFooter({ text: 'Cliquez sur 💬 Répondre ou ➕ Soumettre une confession.', iconURL: client.user.displayAvatarURL() })
      .setTimestamp();

    const submitButton = new ButtonBuilder()
      .setCustomId('open_modal')
      .setLabel('➕ Soumettre une confession')
      .setStyle(ButtonStyle.Primary);

    const replyButton = new ButtonBuilder()
      .setCustomId(`reply_confession_${config.count}`)
      .setLabel('💬 Répondre')
      .setStyle(ButtonStyle.Secondary);

    const sentMessage = await confessionChannel.send({
      embeds: [embed],
      components: [
        new ActionRowBuilder().addComponents(submitButton, replyButton)
      ]
    });

    const logEmbed = new EmbedBuilder()
      .setTitle(`✅ Confession #${config.count}`)
      .setDescription(`\`\`\`\n${confessionText}\n\`\`\``)
      .addFields(
        { name: 'Auteur', value: `<@${interaction.user.id}> *(ID: ${interaction.user.id})*` },
        { name: 'Message', value: `https://discord.com/channels/${interaction.guild.id}/${confessionChannel.id}/${sentMessage.id}` }
      )
      .setColor(randomColor)
      .setTimestamp();

    const logMessage = await logsChannel.send({ embeds: [logEmbed] });
    const thread = await logMessage.startThread({
      name: `Confession #${config.count}`,
      autoArchiveDuration: 10080
    });

    console.log('Thread créé pour le log:', thread.name);

    await interaction.reply({ content: '✅ Confession envoyée anonymement !', flags: 64 });
  }

  if (interaction.isButton() && interaction.customId.startsWith('reply_confession_')) {
    const confessionNumber = interaction.customId.replace('reply_confession_', '');
    const threadName = `Réponse à Confession #${confessionNumber}`;
    let thread;

    if (interaction.message.hasThread) {
      thread = await interaction.message.thread.fetch();
    } else {
      thread = await interaction.message.startThread({
        name: threadName,
        autoArchiveDuration: 10080
      });
    }

    const modal = new ModalBuilder()
      .setCustomId(`submit_reply_${thread.id}`) // <- thread.id est utilisé pour savoir où poster
      .setTitle('Répondre à la confession');

    const replyInput = new TextInputBuilder()
      .setCustomId('reply_text')
      .setLabel('Votre réponse')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(replyInput));
    await interaction.showModal(modal);
  }



  if (interaction.isModalSubmit() && interaction.customId.startsWith('submit_reply_')) {
    const config = getConfig(interaction.guildId);
    config.replyCount = (config.replyCount || 0) + 1;
    saveConfig(interaction.guildId, config);

    const replyText = interaction.fields.getTextInputValue('reply_text');
    const threadId = interaction.customId.replace('submit_reply_', '');

    const confessionThread = await client.channels.fetch(threadId);
    if (!confessionThread || !confessionThread.isThread()) {
      return interaction.reply({ content: '❌ Thread invalide.', flags: 64 });
    }

    const replyEmbed = new EmbedBuilder()
      .setTitle(`💬 Réponse #${config.replyCount}`)
      .setDescription(`> ${replyText}`)
      .setColor('Random')
      .setTimestamp();

    const sentReply = await confessionThread.send({ embeds: [replyEmbed] });

    const confessionNumber = confessionThread.name.match(/#(\d+)/)?.[1];
    if (!confessionNumber) {
      console.log('⚠️ Impossible de récupérer le numéro de la confession depuis le nom du thread');
      return interaction.reply({ content: '❌ Erreur lors du traitement.', flags: 64 });
    }

    const logsChannel = await client.channels.fetch(config.logsChannelId);
    const messages = await logsChannel.messages.fetch({ limit: 100 });

    const logMessage = messages.find(msg =>
      msg.embeds.length > 0 &&
      msg.embeds[0].title?.includes(`Confession #${confessionNumber}`)
    );

    if (!logMessage) {
      console.log('⚠️ Message de log non trouvé pour la confession');
      return interaction.reply({ content: '❌ Log introuvable.', flags: 64 });
    }

    let logThread;
    if (logMessage.hasThread) {
      logThread = await logMessage.thread.fetch();
    } else {
      logThread = await logMessage.startThread({
        name: `Logs Confession #${confessionNumber}`,
        autoArchiveDuration: 10080,
      });
    }

    const logEmbed = new EmbedBuilder()
      .setTitle(`📝 Réponse #${config.replyCount}`)
      .addFields(
        { name: 'Confession', value: `#${confessionNumber}` },
        { name: 'Auteur', value: `<@${interaction.user.id}> *(ID: ${interaction.user.id})*` },
        { name: 'Réponse', value: `https://discord.com/channels/${interaction.guildId}/${confessionThread.id}/${sentReply.id}` }
      )
      .setColor('Random')
      .setTimestamp();

    await logThread.send({ embeds: [logEmbed] });

    await interaction.reply({ content: '✅ Réponse envoyée.', flags: 64 });
  }
    
});

client.login(process.env.TOKEN);
