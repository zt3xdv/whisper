export const staffRoleIds = new Set([
  "1532129685872312581",
  "1367829069944590357",
  "1147807484740911137",
  "1264193070996525096"
]);

export function isStaff(member) {
  if (!member) return false;
  
  const rolesCache = member.roles?.cache;
  if (rolesCache && typeof rolesCache.some === "function") {
    return rolesCache.some(r => staffRoleIds.has(r.id));
  }
  
  if (Array.isArray(member.roles)) {
    return member.roles.some(r => staffRoleIds.has(typeof r === "string" ? r : r.id));
  }
  
  if (Array.isArray(member._roles)) {
    return member._roles.some(r => staffRoleIds.has(r));
  }

  return false;
}
