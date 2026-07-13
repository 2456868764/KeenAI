import type { z } from "zod";
import { type WorkflowDefinition, workflowDefinitionSchema } from "./schema.js";

export type WorkflowTemplateCategory =
  | "routing"
  | "ai"
  | "self_serve"
  | "csat"
  | "handoff"
  | "lead_capture"
  | "automation"
  | "survey"
  | "crm";

export type WorkflowTemplate = {
  id: string;
  name: string;
  description: string;
  category: WorkflowTemplateCategory;
  definition: WorkflowDefinition;
};

type WorkflowTemplateInput = Omit<WorkflowTemplate, "definition"> & {
  definition: z.input<typeof workflowDefinitionSchema>;
};

const templateInputs = [
  {
    id: "tpl-route-to-team",
    name: "Route customer conversations to the right team",
    description: "Branch by channel and assign conversations to the matching support owner.",
    category: "routing",
    definition: {
      trigger: "first_message",
      blocks: [
        {
          id: "route_channel",
          type: "branches",
          branches: [
            {
              label: "Email",
              condition: { field: "channelType", op: "eq", value: "email" },
              nextId: "assign_email",
            },
            {
              label: "Messenger",
              condition: { field: "channelType", op: "eq", value: "messenger" },
              nextId: "assign_live",
            },
          ],
          elseNextId: "assign_general",
        },
        { id: "assign_email", type: "assign", assigneeId: null },
        { id: "assign_live", type: "assign", assigneeId: null },
        { id: "assign_general", type: "assign", assigneeId: null },
      ],
    },
  },
  {
    id: "tpl-keeni-answers-first",
    name: "Let Keeni AI Agent answer first",
    description: "Ask Keeni to draft the first answer and fall back to a teammate when needed.",
    category: "ai",
    definition: {
      trigger: "first_message",
      blocks: [
        {
          id: "keeni_answer",
          type: "let_keeni_answer",
          instructions: "Answer with the brand voice. Escalate if the question is ambiguous.",
          outcomeRouting: {
            resolvedNext: null,
            unresolvedNext: "assign_teammate",
            escalatedNext: "assign_teammate",
          },
        },
        { id: "assign_teammate", type: "assign", assigneeId: null },
      ],
    },
  },
  {
    id: "tpl-self-serve-faq",
    name: "Solve frequent queries with self-serve content",
    description: "Offer common self-serve paths before handing off to the team.",
    category: "self_serve",
    definition: {
      trigger: "first_message",
      blocks: [
        {
          id: "faq_buttons",
          type: "reply_buttons",
          prompt: "What can we help you with?",
          allowFreeText: true,
          autoCloseMinutes: 10,
          buttons: [
            { id: "billing", label: "Billing", nextId: "billing_reply" },
            { id: "account", label: "Account access", nextId: "account_reply" },
            { id: "teammate", label: "Talk to support", nextId: "assign_teammate" },
          ],
        },
        {
          id: "billing_reply",
          type: "send_message",
          plainText: "Here are the billing resources. Reply here if you still need help.",
        },
        {
          id: "account_reply",
          type: "send_message",
          plainText: "Here are the account access steps. Reply here if you still need help.",
        },
        { id: "assign_teammate", type: "assign", assigneeId: null },
      ],
    },
  },
  {
    id: "tpl-csat-after-close",
    name: "Ask customers for a conversation rating",
    description: "Request CSAT after a support flow and wait for the rating.",
    category: "csat",
    definition: {
      trigger: "customer_unresponsive",
      inactivityMinutes: 0,
      blocks: [
        { id: "wait_before_csat", type: "wait", seconds: 120 },
        {
          id: "csat_request",
          type: "csat",
          prompt: "How would you rate this conversation?",
          allowComment: true,
          waitForRating: true,
          waitForRatingMinutes: 1440,
        },
      ],
    },
  },
  {
    id: "tpl-auto-reassign-unresponsive",
    name: "Auto-reassign for unresponsive teammates",
    description: "Reassign stale conversations after a customer has waited too long.",
    category: "handoff",
    definition: {
      trigger: "customer_unresponsive",
      inactivityMinutes: 15,
      blocks: [
        { id: "tag_waiting", type: "tag_conversation", tags: ["waiting-too-long"], mode: "append" },
        { id: "assign_queue", type: "assign", assigneeId: null },
      ],
    },
  },
  {
    id: "tpl-lead-qualify",
    name: "Collect contact details from leads",
    description: "Gather email and company details before routing the conversation.",
    category: "lead_capture",
    definition: {
      trigger: "first_message",
      blocks: [
        {
          id: "collect_contact",
          type: "collect_data",
          prompt: "Please share a few details so we can route you to the right person.",
          allowFreeText: true,
          autoCloseMinutes: 15,
          fields: [
            { key: "email", label: "Work email", required: true },
            { key: "company", label: "Company", required: true },
          ],
        },
        { id: "assign_sales", type: "assign", assigneeId: null },
      ],
    },
  },
  {
    id: "tpl-email-only-out-of-hours",
    name: "Require email outside office hours",
    description: "Collect an email before follow-up when live support is unavailable.",
    category: "lead_capture",
    definition: {
      trigger: "first_message",
      blocks: [
        {
          id: "collect_email",
          type: "collect_data",
          prompt: "We are away right now. Please leave your email and we will follow up.",
          allowFreeText: false,
          autoCloseMinutes: 30,
          fields: [{ key: "email", label: "Email", required: true }],
        },
      ],
    },
  },
  {
    id: "tpl-fully-automated",
    name: "Button-only fully automated triage",
    description: "Guide customers through fixed options and close completed paths.",
    category: "automation",
    definition: {
      trigger: "first_message",
      blocks: [
        {
          id: "triage",
          type: "reply_buttons",
          prompt: "Choose the option that best matches your question.",
          allowFreeText: false,
          autoCloseMinutes: 10,
          buttons: [
            { id: "status", label: "Order status", nextId: "status_reply" },
            { id: "refund", label: "Refund policy", nextId: "refund_reply" },
          ],
        },
        { id: "status_reply", type: "send_message", plainText: "Here is how to check status." },
        { id: "refund_reply", type: "send_message", plainText: "Here is our refund policy." },
      ],
    },
  },
  {
    id: "tpl-csat-low-rating-followup",
    name: "CSAT low rating follow-up",
    description: "Tag low-rating conversations and assign them for review.",
    category: "csat",
    definition: {
      trigger: "customer_unresponsive",
      inactivityMinutes: 0,
      blocks: [
        {
          id: "csat_request",
          type: "csat",
          prompt: "How did we do?",
          allowComment: true,
          waitForRating: true,
          waitForRatingMinutes: 1440,
        },
        { id: "tag_review", type: "tag_conversation", tags: ["csat-review"], mode: "append" },
        { id: "assign_lead", type: "assign", assigneeId: null },
      ],
    },
  },
  {
    id: "tpl-schedule-weekly-survey",
    name: "Weekly NPS to active users",
    description: "Start a survey-style workflow that can be scheduled by an external trigger.",
    category: "survey",
    definition: {
      trigger: "first_message",
      blocks: [
        {
          id: "nps_buttons",
          type: "reply_buttons",
          prompt: "How likely are you to recommend us this week?",
          allowFreeText: true,
          autoCloseMinutes: 60,
          buttons: [
            { id: "low", label: "0-6", nextId: "tag_followup" },
            { id: "mid", label: "7-8", nextId: "thanks" },
            { id: "high", label: "9-10", nextId: "thanks" },
          ],
        },
        { id: "tag_followup", type: "tag_conversation", tags: ["nps-followup"], mode: "append" },
        { id: "thanks", type: "send_message", plainText: "Thanks for the feedback." },
      ],
    },
  },
  {
    id: "tpl-webhook-tag-from-crm",
    name: "CRM webhook tag VIP",
    description: "Tag VIP conversations when a CRM webhook event arrives.",
    category: "crm",
    definition: {
      trigger: "webhook",
      blocks: [
        { id: "tag_vip", type: "tag_conversation", tags: ["vip"], mode: "append" },
        { id: "assign_priority", type: "assign", assigneeId: null },
      ],
    },
  },
] satisfies WorkflowTemplateInput[];

export const WORKFLOW_TEMPLATES: readonly WorkflowTemplate[] = templateInputs.map((template) => ({
  ...template,
  definition: workflowDefinitionSchema.parse(template.definition),
}));

export function listWorkflowTemplates(): WorkflowTemplate[] {
  return WORKFLOW_TEMPLATES.map((template) => ({
    ...template,
    definition: JSON.parse(JSON.stringify(template.definition)) as WorkflowDefinition,
  }));
}
