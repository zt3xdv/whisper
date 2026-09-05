import { Events } from "discord.js";

export default {
  id: "ready",
  name: Events.ClientReady,
  async execute(client) {
    console.log("Logged in as", client.user.tag);
  }
};
