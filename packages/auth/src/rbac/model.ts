export const CASBIN_MODEL = `
[request_definition]
r = sub, obj, act

[policy_definition]
p = sub, obj, act

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = r.sub == p.sub && (p.obj == "*" || r.obj == p.obj) && (p.act == "*" || r.act == p.act)
`;

/** Default RBAC policies — Owner / Admin / Agent / Lite */
export const DEFAULT_POLICIES: Array<[string, string, string]> = [
  ["owner", "*", "*"],
  ["admin", "conversation", "*"],
  ["admin", "ticket", "*"],
  ["admin", "workflow", "*"],
  ["admin", "feedback", "*"],
  ["admin", "helpcenter", "*"],
  ["admin", "member", "read"],
  ["admin", "brand", "*"],
  ["admin", "billing", "read"],
  ["agent", "conversation", "*"],
  ["agent", "ticket", "read"],
  ["agent", "ticket", "write"],
  ["agent", "workflow", "read"],
  ["agent", "feedback", "read"],
  ["agent", "helpcenter", "read"],
  ["lite", "conversation", "read"],
  ["lite", "ticket", "read"],
];
