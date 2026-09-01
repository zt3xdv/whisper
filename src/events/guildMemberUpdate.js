import { Events } from "discord.js";
import { isStaff } from "../utils/staff.js";

export default {
  id: "guildMemberUpdate",
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember) {
    if (oldMember.premiumSince && !newMember.premiumSince && !isStaff(newMember)) {
      const { guild, client, user } = newMember;
      const key = `br_${guild.id}_${user.id}`;
      const roleId = await client.db.get(key);

      if (roleId) {
        const role = await guild.roles.fetch(roleId).catch(() => null);
        if (role) await role.delete().catch(() => {});
        await client.db.delete(key);
      }
    }
  }
};
