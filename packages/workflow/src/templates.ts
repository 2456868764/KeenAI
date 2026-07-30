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
    name: "Triage issues to teams",
    description:
      "Triage issues and assign to different teams and let specialized Keeni AI Agents answer users first.",
    category: "handoff",
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
    name: "Let Keeni answer users first",
    description: "Let Keeni answer users first and triage to correct teams if needed.",
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
    id: "tpl-prioritize-stale-conversations",
    name: "Prioritize stale conversations",
    description: "Automatically follow up and bump stale conversations.",
    category: "handoff",
    definition: {
      trigger: "customer_unresponsive",
      inactivityMinutes: 15,
      blocks: [
        { id: "tag_stale", type: "tag_conversation", tags: ["stale"], mode: "append" },
        { id: "priority_stale", type: "mark_priority", priority: "high" },
        { id: "assign_queue", type: "assign", assigneeId: null },
      ],
    },
  },
  {
    id: "tpl-solve-frequent-queries",
    name: "Solve frequent queries",
    description: "Automatically provide answers to frequently asked questions.",
    category: "self_serve",
    definition: {
      trigger: "first_message",
      blocks: [
        {
          id: "keeni_faq_answer",
          type: "let_keeni_answer",
          instructions:
            "Answer with KB-backed self-serve guidance. Escalate when the answer is missing.",
          outcomeRouting: {
            resolvedNext: null,
            unresolvedNext: "faq_buttons",
            escalatedNext: "assign_teammate",
          },
        },
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
    id: "tpl-convert-trial-users",
    name: "Convert trial users into paying customers",
    description:
      "Gather feedback from trial users and motivate them to upgrade by showcasing the benefits of a paid plan.",
    category: "lead_capture",
    definition: {
      trigger: "page_view",
      pageRules: [{ urlOp: "contains", url: "/pricing", timeOnPageSec: 20 }],
      audience: {
        match: "all",
        rules: [{ field: "attributes.plan", op: "eq", value: "trial" }],
      },
      blocks: [
        {
          id: "trial_pitch",
          type: "reply_buttons",
          prompt:
            "Hey there! You are halfway through your trial - can we help with anything before you decide?",
          allowFreeText: true,
          buttons: [
            { id: "upgrade", label: "Yes, let's talk upgrading", nextId: "sales_reply" },
            { id: "extend", label: "I would like to extend my trial", nextId: "sales_reply" },
            { id: "convince", label: "I still need some convincing", nextId: "benefits_reply" },
            { id: "good", label: "I'm all good", nextId: null },
          ],
        },
        {
          id: "sales_reply",
          type: "send_message",
          plainText:
            "Awesome! Someone from our sales team will be in touch shortly. You can also schedule a chat with our team here.",
        },
        { id: "assign_sales", type: "assign", assigneeId: null },
        {
          id: "benefits_reply",
          type: "add_note",
          plainText:
            "Trial user asked for more convincing. Share benefits of a paid plan before publishing.",
        },
      ],
    },
  },
  {
    id: "tpl-lead-qualify",
    name: "Collect contact details from leads",
    description: "Collect contact details from leads to contact them later.",
    category: "lead_capture",
    definition: {
      trigger: "first_message",
      blocks: [
        {
          id: "collect_contact",
          type: "collect_data",
          prompt: "Please share your contact details so we can follow up.",
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
    id: "tpl-friendly-inactive-reminder",
    name: "Send a friendly reminder to inactive customers",
    description: "Send a friendly reminder to customers who have been unresponsive for some time.",
    category: "lead_capture",
    definition: {
      trigger: "customer_unresponsive",
      inactivityMinutes: 60,
      blocks: [
        {
          id: "friendly_reminder",
          type: "send_message",
          plainText:
            "Just checking in. Reply here if you still need help and we will pick this up.",
        },
        {
          id: "collect_reply",
          type: "collect_customer_reply",
          prompt: "Reply here when you are ready.",
          bufferSeconds: 2,
        },
      ],
    },
  },
  {
    id: "tpl-outside-office-hours",
    name: "Keeni answers outside office hours",
    description: "Let Keeni answer customers outside office hours.",
    category: "ai",
    definition: {
      trigger: "first_message",
      blocks: [
        {
          id: "after_hours_answer",
          type: "let_keeni_answer",
          instructions:
            "Answer using the knowledge base outside office hours. Escalate urgent billing or security issues.",
          outcomeRouting: {
            resolvedNext: null,
            unresolvedNext: "collect_email",
            escalatedNext: "assign_teammate",
          },
        },
        {
          id: "collect_email",
          type: "collect_data",
          prompt: "We are away right now. Please leave your email and we will follow up.",
          allowFreeText: false,
          autoCloseMinutes: 30,
          fields: [{ key: "email", label: "Email", required: true }],
        },
        { id: "assign_teammate", type: "assign", assigneeId: null },
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
    description: "Start a survey-style workflow on a weekly schedule.",
    category: "survey",
    definition: {
      trigger: "schedule",
      cron: "0 9 * * 1",
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
