export function workflowGroupNotice(groupKey: string):
  | {
      text: string;
      href: string;
      linkLabel: string;
    }
  | undefined {
  if (groupKey !== "messenger") return undefined;
  return {
    text: "Basic AI Agent deployment is enabled, AI Agent will take priority over any customer-facing workflows that match",
    href: "/settings/channels",
    linkLabel: "Manage agent deployment",
  };
}
