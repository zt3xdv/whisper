import config from "../../config.json" with { type: "json" };

export function checkPermission(member, permission) {
  if (!member || !permission) return false;
  
  const userPermissions = config.permissions.find(p => 
    p.type === "user" && p.id === member.id
  );
  
  if (userPermissions?.permissions?.includes(permission)) {
    return true;
  }
  
  const memberRoles = member.roles?.cache?.map(r => r.id) || (Array.isArray(member.roles) ? member.roles.map(r => typeof r === "string" ? r : r.id) : []) || (Array.isArray(member._roles) ? member._roles : []);
  
  return config.permissions.some(p =>
    p.type === "role" &&
    memberRoles.includes(p.id) &&
    p.permissions?.includes(permission)
  );
}
