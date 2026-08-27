import { Events } from "discord.js";

export default {
  name: Events.ClientReady,
  async execute(client) {
    console.log("Logged in as", client.user.tag); // very useful line
  }
};
