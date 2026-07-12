export default {
  name: "clientReady",
  async execute(client) {
    console.log("Logged in as", client.user.tag);
  }
};
