import fs from "node:fs/promises";
import path from "node:path";
import { Presentation, PresentationFile } from "/private/tmp/keenai-bp-ppt/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs";

const OUT_DIR = "/Users/jun/GolandProjects/ai77/bot/KeenAI/artifacts/presentations";
const TMP_DIR = "/private/tmp/keenai-bp-ppt";
const FINAL_PPTX = path.join(OUT_DIR, "keenai-bp.pptx");

const W = 1280;
const H = 720;
const PAGE = { left: 48, top: 40, width: 1184, height: 620 };
const C = {
  ink: "#000000",
  muted: "#52565C",
  rule: "#B8BCC4",
  panel: "#F2F2F2",
  panel2: "#EAF5FB",
  accent: "#3D8DFF",
  accentLight: "#D0EDFA",
  white: "#FFFFFF",
};

function addText(slide, text, position, style = {}) {
  const shape = slide.shapes.add({
    geometry: "textbox",
    position,
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
  });
  shape.text = text;
  shape.text.style = {
    fontSize: style.fontSize ?? 20,
    typeface: style.typeface ?? "Helvetica Neue",
    color: style.color ?? C.ink,
    bold: style.bold ?? false,
    alignment: style.alignment ?? "left",
    verticalAlignment: style.verticalAlignment ?? "top",
    autoFit: style.autoFit ?? "shrinkText",
  };
  return shape;
}

function addTitle(slide, title, kicker = "") {
  if (kicker) {
    addText(slide, kicker, { left: PAGE.left, top: 34, width: 560, height: 34 }, {
      fontSize: 18,
      bold: true,
      color: C.muted,
    });
  }
  addText(slide, title, { left: PAGE.left, top: 76, width: 1120, height: 88 }, {
    fontSize: 38,
    bold: true,
  });
  addRule(slide, PAGE.left, 176, 1184);
}

function addFooter(slide, page) {
  addText(slide, String(page).padStart(2, "0"), { left: 1180, top: 660, width: 52, height: 24 }, {
    fontSize: 13,
    alignment: "right",
    color: C.muted,
  });
}

function addRule(slide, left, top, width, color = C.rule) {
  slide.shapes.add({
    geometry: "rect",
    position: { left, top, width, height: 1.2 },
    fill: color,
    line: { style: "solid", fill: color, width: 0 },
  });
}

function addPanel(slide, left, top, width, height, fill = C.panel) {
  return slide.shapes.add({
    geometry: "rect",
    position: { left, top, width, height },
    fill,
    line: { style: "solid", fill: "#D7D9DE", width: 1 },
  });
}

function addTag(slide, label, left, top, width = 132) {
  addPanel(slide, left, top, width, 34, C.panel2);
  addText(slide, label, { left: left + 12, top: top + 6, width: width - 24, height: 22 }, {
    fontSize: 16,
    bold: true,
    color: C.accent,
  });
}

function addList(slide, items, left, top, width, lineHeight = 34, fontSize = 21) {
  items.forEach((item, i) => {
    addText(slide, "-", { left, top: top + i * lineHeight + 1, width: 16, height: 24 }, {
      fontSize,
      bold: true,
      color: C.accent,
    });
    addText(slide, item, { left: left + 24, top: top + i * lineHeight, width: width - 24, height: lineHeight }, {
      fontSize,
      color: C.ink,
    });
  });
}

function addCard(slide, { title, body, left, top, width, height, fill = C.panel }) {
  addPanel(slide, left, top, width, height, fill);
  addText(slide, title, { left: left + 22, top: top + 20, width: width - 44, height: 34 }, {
    fontSize: 24,
    bold: true,
  });
  addText(slide, body, { left: left + 22, top: top + 68, width: width - 44, height: height - 88 }, {
    fontSize: 18,
    color: C.muted,
  });
}

function addMetric(slide, value, label, left, top, width, height) {
  addPanel(slide, left, top, width, height, C.panel);
  addText(slide, value, { left: left + 22, top: top + 24, width: width - 44, height: 58 }, {
    fontSize: value.length > 8 ? 30 : 36,
    bold: true,
    color: C.accent,
  });
  addText(slide, label, { left: left + 22, top: top + 92, width: width - 44, height: height - 108 }, {
    fontSize: 17,
    color: C.muted,
  });
}

function addArrow(slide, x1, y1, x2, y2) {
  slide.shapes.add({
    geometry: "rightArrow",
    position: { left: x1, top: y1, width: x2 - x1, height: y2 - y1 },
    fill: C.accentLight,
    line: { style: "solid", fill: C.accentLight, width: 0 },
  });
}

function notes(slide, lines) {
  slide.speakerNotes.textFrame.setText(lines);
  slide.speakerNotes.setVisible(true);
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.mkdir(TMP_DIR, { recursive: true });

  const presentation = Presentation.create({ slideSize: { width: W, height: H } });

  // 1 Cover
  {
    const slide = presentation.slides.add();
    slide.background.fill = C.white;
    addText(slide, "KeenAI", { left: 48, top: 42, width: 420, height: 54 }, {
      fontSize: 34,
      bold: true,
    });
    addText(slide, "开源、AI 原生、可私有化部署的客户支持与产品反馈平台", {
      left: 48,
      top: 250,
      width: 1030,
      height: 180,
    }, { fontSize: 56, bold: true });
    addText(slide, "替代 Intercom / Zendesk / Featurebase / Canny，把多渠道客服、知识库、AI Agent、Workflow、工单和反馈闭环放进一个系统。", {
      left: 48,
      top: 472,
      width: 940,
      height: 78,
    }, { fontSize: 24, color: C.muted });
    addText(slide, "BP | 10 pages", { left: 48, top: 648, width: 320, height: 28 }, {
      fontSize: 18,
      color: C.muted,
    });
    addFooter(slide, 1);
    notes(slide, [
      "[Sources] README.md §1 Vision; docs/01-PRD.md §1 Product overview.",
      "Position KeenAI as a decision-ready open-source alternative for customer support and product feedback.",
    ]);
  }

  // 2 Pain
  {
    const slide = presentation.slides.add();
    addTitle(slide, "企业客服与反馈系统的真实痛点，不是缺一个聊天窗口", "真实企业痛点");
    addCard(slide, {
      title: "成本持续上升",
      body: "SaaS 工具按 seat、AI resolution、用量叠加收费；中小团队在增长前就承担企业级成本。",
      left: 48,
      top: 226,
      width: 365,
      height: 170,
    });
    addCard(slide, {
      title: "数据和 AI 不可控",
      body: "客户对话、工单、知识库和反馈沉在第三方平台；模型黑盒，合规和私有化困难。",
      left: 457,
      top: 226,
      width: 365,
      height: 170,
    });
    addCard(slide, {
      title: "工具割裂",
      body: "客服、邮件、Discord、工单、反馈、路线图、知识库分别在不同工具里，闭环依赖人工搬运。",
      left: 866,
      top: 226,
      width: 365,
      height: 170,
    });
    addCard(slide, {
      title: "流程无法规模化",
      body: "高价值客户优先级、SLA、Bug 分流、功能需求归并、客服交接都依赖经验，漏单和重复劳动频繁发生。",
      left: 48,
      top: 438,
      width: 548,
      height: 150,
      fill: C.panel2,
    });
    addCard(slide, {
      title: "KeenAI 的切入点",
      body: "用可控 AI + 自动化流程 + 多端入口统一解决支持和反馈闭环，而不是再增加一个单点工具。",
      left: 684,
      top: 438,
      width: 548,
      height: 150,
      fill: C.panel2,
    });
    addFooter(slide, 2);
    notes(slide, [
      "[Sources] docs/01-PRD.md §1.3 Differentiation; §8 Risks; README.md §1 Vision.",
      "Visible claims are synthesized from the repository PRD and README, not third-party market research.",
    ]);
  }

  // 3 Personas
  {
    const slide = presentation.slides.add();
    addTitle(slide, "目标客户集中在需要低成本、可控 AI 和私有化的团队", "目标客户画像");
    addCard(slide, {
      title: "SaaS 创业团队",
      body: "5-50 人；月活 1k-100k。\n痛点：Intercom 成本高，Zendesk 太重，反馈闭环弱。\n购买动机：低成本客服、AI 首响、反馈和路线图一体化。",
      left: 48,
      top: 226,
      width: 365,
      height: 310,
    });
    addCard(slide, {
      title: "独立开发者",
      body: "1-5 人维护多个产品。\n痛点：没有专职客服，重复问题消耗开发时间。\n购买动机：一键部署、AI 7x24 回复、用户反馈沉淀。",
      left: 457,
      top: 226,
      width: 365,
      height: 310,
    });
    addCard(slide, {
      title: "企业内部 IT / DevTool",
      body: "100-10000 员工。\n痛点：数据不能出内网，内部服务台响应慢。\n购买动机：私有化、SSO、审计、本地模型、流程自动化。",
      left: 866,
      top: 226,
      width: 365,
      height: 310,
    });
    addText(slide, "共同需求：把客户入口、知识、AI、工单和反馈沉淀在企业自己可控的系统里。", {
      left: 48,
      top: 594,
      width: 1010,
      height: 42,
    }, { fontSize: 24, bold: true });
    addFooter(slide, 3);
    notes(slide, [
      "[Sources] docs/01-PRD.md §2 Target users; §4 Commercial goals; README.md §6 Quick Start.",
    ]);
  }

  // 4 Platform
  {
    const slide = presentation.slides.add();
    addTitle(slide, "KeenAI 把支持、反馈和产品更新组织成一个闭环", "解决方案总览");
    const y = 286;
    addCard(slide, {
      title: "多端入口",
      body: "Widget / Email / Discord / Slack / Telegram / API",
      left: 48,
      top: y,
      width: 220,
      height: 150,
      fill: C.panel2,
    });
    addArrow(slide, 288, y + 54, 372, y + 96);
    addCard(slide, {
      title: "统一 Inbox",
      body: "对话、客户、标签、SLA、工单上下文集中处理",
      left: 392,
      top: y,
      width: 220,
      height: 150,
    });
    addArrow(slide, 632, y + 54, 716, y + 96);
    addCard(slide, {
      title: "AI + Workflow",
      body: "Keeni AI Agent 判断、回答、执行；Workflow 触发和编排",
      left: 736,
      top: y,
      width: 220,
      height: 150,
      fill: C.panel2,
    });
    addArrow(slide, 976, y + 54, 1060, y + 96);
    addCard(slide, {
      title: "业务闭环",
      body: "Tickets / Feedback / Roadmap / Changelog / Help Center",
      left: 1080,
      top: y,
      width: 152,
      height: 150,
    });
    addText(slide, "结果：更少人工重复处理，更快首响，更稳定服务质量，更完整的产品反馈沉淀。", {
      left: 48,
      top: 524,
      width: 1050,
      height: 42,
    }, { fontSize: 27, bold: true });
    addFooter(slide, 4);
    notes(slide, [
      "[Sources] README.md §2 Product Matrix; docs/04-MODULES.md Module overview; docs/02-FEATURES.md Support Platform modules.",
    ]);
  }

  // 5 Multi-channel
  {
    const slide = presentation.slides.add();
    addTitle(slide, "多端接入让客户在哪里提问，企业就在哪里响应", "多渠道入口");
    const xs = [48, 292, 536, 780, 1024];
    const cards = [
      ["Messenger Widget", "嵌入官网和产品内，承接访客、登录用户和自助服务入口。"],
      ["Email", "support@ 邮件自动归并线程，转 Conversation 或 Ticket。"],
      ["Discord / Slack", "面向社区、开发者客户和内部协作场景的即时支持。"],
      ["Telegram / WhatsApp", "覆盖移动优先和国际化支持场景，后续扩展微信、LINE。"],
      ["API / Webhook", "业务系统、工单系统、CRM 和自定义工具可直接接入。"],
    ];
    cards.forEach(([title, body], i) => {
      addCard(slide, {
        title,
        body,
        left: xs[i],
        top: 222,
        width: 208,
        height: 254,
        fill: i % 2 === 0 ? C.panel2 : C.panel,
      });
    });
    addText(slide, "所有入口统一进入同一套客户上下文、AI 判断、知识库检索、Workflow 分派和数据分析。", {
      left: 48,
      top: 552,
      width: 1060,
      height: 58,
    }, { fontSize: 29, bold: true });
    addFooter(slide, 5);
    notes(slide, [
      "[Sources] docs/02-FEATURES.md §1.2 Channels; README.md §2 Product Matrix; docs/14-MULTIMODAL.md for multimodal channel direction.",
    ]);
  }

  // 6 KB / RAG
  {
    const slide = presentation.slides.add();
    addTitle(slide, "知识库是 AI 可控回答的事实层，而不是附属文档库", "Knowledge Base / RAG");
    addText(slide, "KeenAI 将 Help Center、产品文档、FAQ、历史工单、反馈和外部文档同步成可检索知识层。", {
      left: 48,
      top: 216,
      width: 1060,
      height: 46,
    }, { fontSize: 25, bold: true });
    addList(slide, [
      "多来源同步：Help Center、Markdown、网页、GitHub、Intercom / Zendesk 导入、Roadmap 数据。",
      "混合检索：全文搜索 + 向量召回 + rerank，兼顾关键词精确匹配和语义理解。",
      "可追溯答案：Agent 输出时附来源链接，降低幻觉和错误承诺风险。",
      "知识生命周期：版本、更新、过期、置信度和评测样本用于持续提升回答质量。",
      "企业私有化：知识、向量和查询日志可全部留在企业自己的数据库和对象存储中。",
    ], 72, 310, 1030, 46, 22);
    addFooter(slide, 6);
    notes(slide, [
      "[Sources] docs/11-RAG-KNOWLEDGE.md; docs/KB-DOCUMENT-PARSERS.md; packages/kb/config/kb-freshness.yaml; README.md §4.2 AI Core.",
    ]);
  }

  // 7 Agent
  {
    const slide = presentation.slides.add();
    addTitle(slide, "Keeni AI Agent 负责理解、回答、执行和升级", "Keeni AI Agent");
    addCard(slide, {
      title: "理解客户意图",
      body: "识别咨询、Bug、账单、退款、功能请求、账号问题和情绪风险。",
      left: 48,
      top: 226,
      width: 270,
      height: 170,
      fill: C.panel2,
    });
    addCard(slide, {
      title: "检索可信答案",
      body: "优先调用知识库和历史解决方案，通过 RAG 生成带来源的回复。",
      left: 352,
      top: 226,
      width: 270,
      height: 170,
    });
    addCard(slide, {
      title: "执行客服动作",
      body: "创建 Ticket、打标签、查业务系统、推荐文档、订阅反馈、生成草稿。",
      left: 656,
      top: 226,
      width: 270,
      height: 170,
      fill: C.panel2,
    });
    addCard(slide, {
      title: "升级人工兜底",
      body: "低置信度、负面情绪、合规/退款等场景转人工，并交付摘要和建议。",
      left: 960,
      top: 226,
      width: 270,
      height: 170,
    });
    addText(slide, "企业价值：把重复首响和资料查询交给 AI，把复杂判断和关系维护留给人工。", {
      left: 48,
      top: 500,
      width: 1060,
      height: 58,
    }, { fontSize: 30, bold: true });
    addText(slide, "支持 OpenAI / Anthropic / Gemini / DeepSeek / Kimi / Ollama，本地模型可用于私有化和离线部署。", {
      left: 48,
      top: 582,
      width: 1080,
      height: 36,
    }, { fontSize: 20, color: C.muted });
    addFooter(slide, 7);
    notes(slide, [
      "[Sources] docs/09-AGENT-ENGINE.md; docs/10-AGENT-MEMORY.md; docs/11-RAG-KNOWLEDGE.md; packages/llm/src provider abstractions referenced in docs/04-MODULES.md.",
    ]);
  }

  // 8 Workflow
  {
    const slide = presentation.slides.add();
    addTitle(slide, "Workflow 把客服处理经验变成可配置、可追踪的自动化流程", "Workflow 自动化");
    addTag(slide, "Trigger", 72, 232);
    addText(slide, "客户发起对话\n邮件进入\nDiscord 提问\nTicket 状态变化\n客户超时未回复", {
      left: 72,
      top: 288,
      width: 300,
      height: 190,
    }, { fontSize: 22 });
    addArrow(slide, 384, 332, 496, 374);
    addTag(slide, "Condition", 526, 232, 150);
    addText(slide, "客户等级\n渠道来源\n工作时间\n关键词/意图\nAI 置信度\n是否已有工单", {
      left: 526,
      top: 288,
      width: 300,
      height: 220,
    }, { fontSize: 22 });
    addArrow(slide, 816, 332, 928, 374);
    addTag(slide, "Action", 958, 232);
    addText(slide, "让 AI 回答\n分配团队\n创建 Ticket\n应用 SLA\n发送通知\n调用 API / MCP", {
      left: 958,
      top: 288,
      width: 260,
      height: 220,
    }, { fontSize: 22 });
    addText(slide, "典型流程：企业客户发起 Bug 反馈 -> AI 判断类型 -> 创建高优先级工单 -> 分配工程支持 -> 客户自动收到进度通知。", {
      left: 48,
      top: 574,
      width: 1120,
      height: 42,
    }, { fontSize: 22, bold: true });
    addFooter(slide, 8);
    notes(slide, [
      "[Sources] docs/13-WORKFLOW.md; docs/02-FEATURES.md §1.5 Workflows; README.md Product Matrix.",
    ]);
  }

  // 9 Tech
  {
    const slide = presentation.slides.add();
    addTitle(slide, "技术方案兼顾开箱自托管、企业扩展和 AI 可替换", "技术架构");
    addCard(slide, {
      title: "前端与入口",
      body: "Next.js Dashboard / Portal / Help Center；Preact Widget；WebSocket / SSE 实时体验。",
      left: 48,
      top: 216,
      width: 365,
      height: 160,
      fill: C.panel2,
    });
    addCard(slide, {
      title: "服务与数据",
      body: "Hono + Bun / Node；Drizzle；PostgreSQL + pgvector 或 SQLite / LibSQL；S3 / MinIO 对象存储。",
      left: 457,
      top: 216,
      width: 365,
      height: 160,
    });
    addCard(slide, {
      title: "AI 与自动化",
      body: "Vercel AI SDK；Mastra Agent；RAG；Memory；Inngest Workflow；BullMQ 队列。",
      left: 866,
      top: 216,
      width: 365,
      height: 160,
      fill: C.panel2,
    });
    addMetric(slide, "Lite", "单机 Docker / SQLite，适合 Indie、Demo 和低成本自托管。", 48, 438, 260, 150);
    addMetric(slide, "Standard", "PostgreSQL + Redis + MinIO，适合中小团队生产部署。", 364, 438, 260, 150);
    addMetric(slide, "Cloud", "Vercel / Cloudflare / managed PG，适合托管 SaaS。", 680, 438, 260, 150);
    addMetric(slide, "Enterprise", "私有化、SSO、审计、SLA、本地模型和内网集成。", 996, 438, 236, 150);
    addFooter(slide, 9);
    notes(slide, [
      "[Sources] README.md §3 Tech Stack and §6 Quick Start; docs/03-ARCHITECTURE.md; docs/06-TECH-STACK.md; docs/12-STORAGE-ABSTRACTION.md.",
    ]);
  }

  // 10 Business
  {
    const slide = presentation.slides.add();
    addTitle(slide, "开源获客，云托管和企业私有化完成商业化", "商业规划与里程碑");
    addCard(slide, {
      title: "商业模式",
      body: "自托管 AGPL 免费获取社区和企业线索；云托管按 seat / AI 用量收费；企业版提供私有化、SSO、审计和 SLA。",
      left: 48,
      top: 216,
      width: 550,
      height: 168,
      fill: C.panel2,
    });
    addCard(slide, {
      title: "GTM",
      body: "先抓开发者和 Indie Hacker，再进入中小 SaaS 团队，最后用私有化方案切企业内部 IT / DevTool。",
      left: 682,
      top: 216,
      width: 550,
      height: 168,
    });
    addRule(slide, 96, 492, 1088, C.ink);
    const milestones = [
      ["0-3M", "MVP\nInbox / Widget / Email / Copilot"],
      ["3-6M", "核心闭环\nTickets / Workflow / Feedback / Help Center"],
      ["6-9M", "AI 完整版\nAgent / Memory / RAG / Roadmap / Changelog"],
      ["9-12M", "商业化\nEnterprise / Cloud / Plugin ecosystem"],
    ];
    milestones.forEach(([date, label], i) => {
      const left = 82 + i * 292;
      slide.shapes.add({
        geometry: "ellipse",
        position: { left, top: 480, width: 24, height: 24 },
        fill: C.accent,
        line: { style: "solid", fill: C.accent, width: 0 },
      });
      addText(slide, date, { left: left - 8, top: 520, width: 80, height: 28 }, {
        fontSize: 19,
        bold: true,
      });
      addText(slide, label, { left: left - 8, top: 556, width: 230, height: 80 }, {
        fontSize: 17,
        color: C.muted,
      });
    });
    addFooter(slide, 10);
    notes(slide, [
      "[Sources] docs/01-PRD.md §4 Commercial goals; docs/08-ROADMAP.md Timeline and Phase definitions; README.md §7 Roadmap Overview.",
    ]);
  }

  const sourceNotes = [
    "KeenAI BP source notes",
    "README.md: vision, product matrix, tech stack, quick start, roadmap overview.",
    "docs/01-PRD.md: product positioning, target users, pain points, goals, risks.",
    "docs/02-FEATURES.md: channels, conversations, tickets, workflows, product suite.",
    "docs/03-ARCHITECTURE.md: layered architecture and modular monolith.",
    "docs/04-MODULES.md: module overview, AI kernel, LLM abstraction.",
    "docs/08-ROADMAP.md: timeline, phase scope, milestones.",
    "docs/11-RAG-KNOWLEDGE.md: knowledge base and RAG design.",
    "docs/13-WORKFLOW.md: workflow trigger/action design.",
  ].join("\n");
  await fs.writeFile(path.join(TMP_DIR, "source-notes.txt"), sourceNotes);

  for (const [index, slide] of presentation.slides.items.entries()) {
    const stem = `slide-${String(index + 1).padStart(2, "0")}`;
    const png = await presentation.export({ slide, format: "png", scale: 1 });
    await fs.writeFile(path.join(TMP_DIR, `${stem}.png`), new Uint8Array(await png.arrayBuffer()));
    const layout = await slide.export({ format: "layout" });
    await fs.writeFile(path.join(TMP_DIR, `${stem}.layout.json`), await layout.text());
  }

  const montage = await presentation.export({ format: "webp", montage: true, scale: 1 });
  await fs.writeFile(path.join(TMP_DIR, "deck-montage.webp"), new Uint8Array(await montage.arrayBuffer()));

  const pptx = await PresentationFile.exportPptx(presentation);
  await pptx.save(FINAL_PPTX);
  console.log(FINAL_PPTX);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
