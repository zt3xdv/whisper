import { MessageFlags, ComponentType } from "discord.js";

import articles from '../utils/knowledgeBaseArticles.json' with { type: 'json' };

export default {
  name: "knowledge-base",
  description: "Post a link to an article from the knowledge base",
  options: [
    {
      name: 'article',
      description: 'find an article',
      type: ApplicationCommandOptionType.String,
      required: true,
      autocomplete: true
    }
  ],

  async execute(interaction) {
    const article = interaction.options.getString('article');

    if (!articles[article]) {
      return interaction.reply({
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `That article doesn't exist`
              }
            ]
          }
        ],
        flags: MessageFlags.IsComponentsV2
      })
    }


    interaction.reply({ content: `[${article}](${articles[article]})` });
  },

  async autocomplete(interaction) {
    const articleList = Object.keys(articles);
    const input = interaction.options.getString('tag_name');

    if (input === '') {
      const filteredArticles = articleList.slice(0, 25);

      interaction.respond(filteredArticles.map(articleName => ({ name: articleName, value: articleName })));
    }
    else {
      const filteredArticles = findMatches(input, articleList).slice(0, 25);

      interaction.respond(filteredArticles.map(articleName => ({ name: articleName, value: articleName })));
    }

  }
};

// chat gippity code lmao
function findMatches(input, candidates) {
  const query = input.toLowerCase().trim();

  if (!query) return [...candidates];

  function score(candidate) {
    const text = candidate.toLowerCase().trim();

    // Exact match
    if (text === query) return 1000;

    // Starts with query
    if (text.startsWith(query)) return 800;

    // Query matches the beginning of any word
    if (text.split(/\s+/).some(word => word.startsWith(query))) {
      return 600;
    }

    // Query appears anywhere in the string
    if (text.includes(query)) return 400;

    // All query words appear somewhere in candidate
    const queryWords = query.split(/\s+/);
    if (queryWords.every(word => text.includes(word))) {
      return 200;
    }

    return 0;
  }

  return candidates
    .map((candidate, index) => ({
      candidate,
      score: score(candidate),
      index
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(item => item.candidate);
}