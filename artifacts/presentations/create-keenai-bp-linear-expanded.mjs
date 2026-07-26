import fs from "node:fs/promises";
import path from "node:path";
import { Presentation, PresentationFile } from "/private/tmp/keenai-bp-ppt/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs";

const OUT_DIR = "/Users/jun/GolandProjects/ai77/bot/KeenAI/artifacts/presentations";
const TMP_DIR = "/private/tmp/keenai-bp-linear-expanded";
const FINAL_PPTX = path.join(OUT_DIR, "keenai-bp-linear-expanded.pptx");

const W = 1280;
const H = 720;
const C = {
  canvas: "#010102",
  surface1: "#0f1011",
  surface2: "#141516",
  surface3: "#18191a",
  hairline: "#23252a",
  hairlineStrong: "#34343a",
  ink: "#f7f8f8",
  muted: "#d0d6e0",
  subtle: "#8a8f98",
  tertiary: "#62666d",
  primary: "#5e6ad2",
  primaryHover: "#828fff",
  success: "#27a644",
};

function addShape(slide, position, fill = C.surface1, line = C.hairline, geometry = "roundRect") {
  return slide.shapes.add({
    geometry,
    position,
    fill,
    line: { style: "solid", fill: line, width: 1 },
  });
}

function addText(slide, value, position, style = {}) {
  const shape = slide.shapes.add({
    geometry: "textbox",
    position,
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
  });
  shape.text = value;
  shape.text.style = {
    fontSize: style.fontSize ?? 18,
    typeface: style.typeface ?? "SF Pro Display",
    color: style.color ?? C.ink,
    bold: style.bold ?? false,
    alignment: style.alignment ?? "left",
    verticalAlignment: style.verticalAlignment ?? "top",
    autoFit: style.autoFit ?? "shrinkText",
  };
  return shape;
}

function addRule(slide, left, top, width, color = C.hairlineStrong) {
  slide.shapes.add({
    geometry: "rect",
    position: { left, top, width, height: 1 },
    fill: color,
    line: { style: "solid", fill: color, width: 0 },
  });
}

function addChrome(slide, section, page) {
  slide.background.fill = C.canvas;
  addText(slide, "KeenAI", { left: 48, top: 30, width: 160, height: 28 }, {
    fontSize: 18,
    bold: true,
    color: C.ink,
  });
  addText(slide, section, { left: 520, top: 31, width: 360, height: 22 }, {
    fontSize: 13,
    color: C.subtle,
    alignment: "center",
  });
  addText(slide, String(page).padStart(2, "0"), { left: 1188, top: 31, width: 44, height: 22 }, {
    fontSize: 13,
    color: C.tertiary,
    alignment: "right",
  });
  addRule(slide, 48, 72, 1184, C.hairline);
}

function addTitle(slide, section, title, subtitle, page) {
  addChrome(slide, section, page);
  addText(slide, title, { left: 64, top: 110, width: 1040, height: 106 }, {
    fontSize: 42,
    bold: true,
    color: C.ink,
  });
  if (subtitle) {
    addText(slide, subtitle, { left: 66, top: 224, width: 920, height: 54 }, {
      fontSize: 20,
      color: C.subtle,
    });
  }
}

function addCard(slide, { title, body, left, top, width, height, accent = false }) {
  addShape(slide, { left, top, width, height }, accent ? C.surface2 : C.surface1, accent ? C.primary : C.hairline);
  if (accent) {
    slide.shapes.add({
      geometry: "rect",
      position: { left, top, width: 3, height },
      fill: C.primary,
      line: { style: "solid", fill: C.primary, width: 0 },
    });
  }
  addText(slide, title, { left: left + 22, top: top + 20, width: width - 44, height: 34 }, {
    fontSize: 22,
    bold: true,
    color: C.ink,
  });
  addText(slide, body, { left: left + 22, top: top + 66, width: width - 44, height: height - 82 }, {
    fontSize: 16,
    color: C.muted,
  });
}

function addMetric(slide, value, label, left, top, width, height, color = C.primaryHover) {
  addShape(slide, { left, top, width, height }, C.surface1, C.hairline);
  addText(slide, value, { left: left + 22, top: top + 18, width: width - 44, height: 48 }, {
    fontSize: value.length > 9 ? 30 : 36,
    bold: true,
    color,
  });
  addText(slide, label, { left: left + 22, top: top + 76, width: width - 44, height: height - 84 }, {
    fontSize: 16,
    color: C.subtle,
  });
}

function addBullets(slide, items, left, top, width, gap = 38) {
  items.forEach((item, index) => {
    const y = top + index * gap;
    slide.shapes.add({
      geometry: "ellipse",
      position: { left, top: y + 8, width: 7, height: 7 },
      fill: C.primary,
      line: { style: "solid", fill: C.primary, width: 0 },
    });
    addText(slide, item, { left: left + 22, top: y, width, height: gap + 6 }, {
      fontSize: 18,
      color: C.muted,
    });
  });
}

function addStep(slide, num, title, body, left, top, width, height) {
  addShape(slide, { left, top, width, height }, C.surface1, C.hairline);
  addText(slide, num, { left: left + 18, top: top + 16, width: 42, height: 30 }, {
    fontSize: 16,
    bold: true,
    color: C.primaryHover,
  });
  addText(slide, title, { left: left + 64, top: top + 15, width: width - 84, height: 32 }, {
    fontSize: 21,
    bold: true,
  });
  addText(slide, body, { left: left + 64, top: top + 56, width: width - 84, height: height - 70 }, {
    fontSize: 15,
    color: C.subtle,
  });
}

function addConnector(slide, left, top, width) {
  slide.shapes.add({
    geometry: "rightArrow",
    position: { left, top, width, height: 34 },
    fill: C.primary,
    line: { style: "solid", fill: C.primary, width: 0 },
  });
}

function addBlockPill(slide, label, left, top, width, accent = false) {
  addShape(slide, { left, top, width, height: 34 }, accent ? C.surface2 : C.surface1, accent ? C.primary : C.hairline);
  addText(slide, label, { left: left + 12, top: top + 8, width: width - 24, height: 18 }, {
    fontSize: 12,
    color: accent ? C.primaryHover : C.muted,
    bold: accent,
    alignment: "center",
  });
}

function notes(slide, lines) {
  slide.speakerNotes.textFrame.setText(lines);
  slide.speakerNotes.setVisible(true);
}

function addSources(slide, sources) {
  notes(slide, [`[Sources] ${sources.join("; ")}`]);
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.mkdir(TMP_DIR, { recursive: true });
  const presentation = Presentation.create({ slideSize: { width: W, height: H } });

  // 1
  {
    const slide = presentation.slides.add();
    slide.background.fill = C.canvas;
    addText(slide, "KeenAI", { left: 58, top: 48, width: 220, height: 38 }, { fontSize: 24, bold: true });
    addText(slide, "AI-native support operating system", { left: 820, top: 54, width: 360, height: 26 }, {
      fontSize: 14,
      color: C.subtle,
      alignment: "right",
    });
    addText(slide, "开源、AI 原生、可私有化部署的客户支持与产品反馈平台", {
      left: 58,
      top: 214,
      width: 1030,
      height: 162,
    }, { fontSize: 56, bold: true });
    addText(slide, "统一多端入口、知识库、Keeni AI Agent、Memory、Workflow、工单和反馈闭环。", {
      left: 62,
      top: 414,
      width: 920,
      height: 62,
    }, { fontSize: 22, color: C.muted });
    addShape(slide, { left: 62, top: 560, width: 278, height: 48 }, C.primary, C.primary);
    addText(slide, "Business Plan", { left: 85, top: 573, width: 180, height: 22 }, {
      fontSize: 16,
      bold: true,
      color: "#ffffff",
    });
    addText(slide, "Linear style via getdesign.md", { left: 900, top: 660, width: 280, height: 22 }, {
      fontSize: 12,
      color: C.tertiary,
      alignment: "right",
    });
    addSources(slide, ["README.md §1 Vision", "docs/01-PRD.md §1 Product overview", "artifacts/presentations/linear.DESIGN.md"]);
  }

  // 2
  {
    const slide = presentation.slides.add();
    addTitle(slide, "Problem", "真实痛点不是缺聊天窗口，而是客服、知识和反馈无法闭环", "企业在客户支持上同时承受成本、数据控制、流程一致性和 AI 落地压力。", 2);
    addCard(slide, { title: "成本持续上升", body: "Intercom / Zendesk / AI resolution / seat 叠加收费，中小团队在规模化前就承担企业级成本。", left: 64, top: 330, width: 260, height: 170, accent: true });
    addCard(slide, { title: "数据与 AI 不可控", body: "客户对话、工单、知识和反馈沉在第三方平台；模型黑盒，私有化与合规困难。", left: 348, top: 330, width: 260, height: 170 });
    addCard(slide, { title: "多端入口割裂", body: "Email、Widget、Discord、Slack、API 进入不同系统，人工搬运上下文。", left: 632, top: 330, width: 260, height: 170 });
    addCard(slide, { title: "流程依赖经验", body: "高价值客户优先级、SLA、Bug 分流、需求归并和客服交接难以标准化。", left: 916, top: 330, width: 260, height: 170 });
    addText(slide, "KeenAI 的切入点：把入口、知识、AI 判断和自动化动作放进企业自己可控的系统。", { left: 64, top: 582, width: 1040, height: 38 }, { fontSize: 24, bold: true });
    addSources(slide, ["docs/01-PRD.md §1.3", "docs/01-PRD.md §8", "README.md §1"]);
  }

  // 3
  {
    const slide = presentation.slides.add();
    addTitle(slide, "Customers", "目标客户是需要低成本、可控 AI 和私有化的团队", "三类客户共享同一个需求：把支持和反馈数据沉淀在自己的系统里。", 3);
    addCard(slide, { title: "SaaS 创业团队", body: "5-50 人，月活 1k-100k。\n\n痛点：Intercom 成本高，Zendesk 太重，反馈闭环弱。\n\n购买动机：AI 首响、低成本客服、反馈和路线图一体化。", left: 64, top: 310, width: 340, height: 272, accent: true });
    addCard(slide, { title: "独立开发者", body: "1-5 人维护多个产品。\n\n痛点：没有专职客服，重复问题消耗开发时间。\n\n购买动机：一键部署、AI 7x24 回复、用户反馈沉淀。", left: 470, top: 310, width: 340, height: 272 });
    addCard(slide, { title: "企业内部 IT / DevTool", body: "100-10000 员工。\n\n痛点：数据不能出内网，内部服务台响应慢。\n\n购买动机：私有化、SSO、审计、本地模型、流程自动化。", left: 876, top: 310, width: 340, height: 272 });
    addSources(slide, ["docs/01-PRD.md §2 Target users", "docs/01-PRD.md §4 Commercial goals"]);
  }

  // 4
  {
    const slide = presentation.slides.add();
    addTitle(slide, "Platform", "KeenAI 是客户支持与产品反馈的 AI 操作系统", "从客户入口到知识检索、Agent 执行、Workflow 编排和产品反馈沉淀，形成同一条链路。", 4);
    addStep(slide, "01", "Multi-channel intake", "Widget、Email、Discord、Slack、Telegram、API / Webhook 统一进入 Inbox。", 64, 328, 236, 150);
    addConnector(slide, 314, 386, 80);
    addStep(slide, "02", "Context layer", "客户、组织、会话、工单、历史反馈、权限和 SLA 组合成实时上下文。", 412, 328, 236, 150);
    addConnector(slide, 662, 386, 80);
    addStep(slide, "03", "AI Kernel", "Keeni AI Agent + RAG + Memory 判断问题、检索事实、生成或执行动作。", 760, 328, 236, 150);
    addConnector(slide, 1010, 386, 60);
    addStep(slide, "04", "Business loop", "Ticket、Feedback、Roadmap、Changelog、Help Center 形成产品与服务闭环。", 1080, 328, 150, 150);
    addText(slide, "不是单点客服机器人，而是把支持运营流程产品化。", { left: 64, top: 570, width: 860, height: 34 }, { fontSize: 25, bold: true });
    addSources(slide, ["README.md §2 Product Matrix", "docs/04-MODULES.md Module overview", "docs/03-ARCHITECTURE.md §1"]);
  }

  // 5
  {
    const slide = presentation.slides.add();
    addTitle(slide, "Channels", "多端接入让客户在哪里提问，企业就在哪里响应", "所有入口统一进入同一套客户上下文、AI 判断、知识库检索、Workflow 分派和数据分析。", 5);
    const items = [
      ["Messenger Widget", "嵌入官网和产品内，承接访客、登录用户和自助服务入口。"],
      ["Email", "support@ 邮件自动归并线程，转 Conversation 或 Ticket。"],
      ["Discord / Slack", "面向社区、开发者客户和内部协作场景的即时支持。"],
      ["Telegram / WhatsApp", "覆盖移动优先和国际化支持场景，后续扩展微信、LINE。"],
      ["API / Webhook", "业务系统、CRM、工单系统和自定义工具可直接接入。"],
    ];
    items.forEach(([title, body], i) => {
      addCard(slide, { title, body, left: 64 + i * 236, top: 326, width: 206, height: 220, accent: i === 0 });
    });
    addSources(slide, ["docs/02-FEATURES.md §1.2 Channels", "docs/14-MULTIMODAL.md", "README.md §2"]);
  }

  // 6
  {
    const slide = presentation.slides.add();
    addTitle(slide, "Keeni AI Agent", "Keeni AI Agent 负责理解、回答、执行和升级", "Agent 不只生成话术，而是在企业客服流程里使用知识、工具和规则完成可控动作。", 6);
    addCard(slide, { title: "理解客户意图", body: "识别咨询、Bug、账单、退款、功能请求、账号问题、情绪风险和升级条件。", left: 64, top: 310, width: 260, height: 170, accent: true });
    addCard(slide, { title: "检索可信答案", body: "优先调用 Help Center、产品文档、历史工单和内部知识，通过 RAG 生成带来源回复。", left: 348, top: 310, width: 260, height: 170 });
    addCard(slide, { title: "执行客服动作", body: "创建 Ticket、打标签、分配团队、推荐文档、订阅反馈、调用业务系统。", left: 632, top: 310, width: 260, height: 170 });
    addCard(slide, { title: "人工兜底", body: "低置信度、负面情绪、合规/退款等场景转人工，并交付摘要和建议。", left: 916, top: 310, width: 260, height: 170 });
    addText(slide, "企业价值：把重复首响和资料查询交给 AI，把复杂判断和关系维护留给人工。", { left: 64, top: 570, width: 980, height: 34 }, { fontSize: 24, bold: true });
    addSources(slide, ["docs/09-AGENT-ENGINE.md", "docs/04-MODULES.md §1.6 LLM", "README.md §4.2"]);
  }

  // 7
  {
    const slide = presentation.slides.add();
    addTitle(slide, "Agent Runtime", "Agent 的工作循环让每次回复都可解释、可干预、可升级", "Plan -> Retrieve -> Act -> Observe -> Escalate，把 AI 放进企业可审计流程里。", 7);
    const steps = [
      ["Plan", "识别意图、风险、所需上下文和是否需要工具。"],
      ["Retrieve", "从知识库、Memory、客户资料和工单历史取证。"],
      ["Act", "生成回复、调用工具、创建工单或触发 Workflow。"],
      ["Observe", "记录结果、用户反馈、采纳率、CSAT 和后续追问。"],
      ["Escalate", "低置信度、敏感动作或失败路径转人工处理。"],
    ];
    steps.forEach(([title, body], i) => {
      const left = 64 + i * 230;
      addStep(slide, `0${i + 1}`, title, body, left, 330, 190, 150);
      if (i < steps.length - 1) addConnector(slide, left + 198, 388, 40);
    });
    addText(slide, "支持多模型：OpenAI / Anthropic / Gemini / DeepSeek / Kimi / Ollama，本地模型可用于私有化和离线部署。", { left: 64, top: 574, width: 1020, height: 34 }, { fontSize: 19, color: C.muted });
    addSources(slide, ["docs/09-AGENT-ENGINE.md", "docs/10-AGENT-MEMORY.md", "docs/11-RAG-KNOWLEDGE.md"]);
  }

  // 8
  {
    const slide = presentation.slides.add();
    addTitle(slide, "Knowledge Base / RAG", "RAG 是 AI 可控回答的事实层", "KeenAI 将企业知识转成可检索、可评测、可追溯的回答依据。", 8);
    addStep(slide, "01", "Source ingestion", "Help Center、Markdown、网页、GitHub、Intercom / Zendesk 导入、Roadmap 数据和历史工单。", 80, 306, 260, 150);
    addConnector(slide, 360, 364, 76);
    addStep(slide, "02", "Chunk + enrich", "文档切块、元数据、版本、语言、权限、实体和关系抽取。", 456, 306, 260, 150);
    addConnector(slide, 736, 364, 76);
    addStep(slide, "03", "Hybrid retrieval", "全文搜索 + 向量召回 + rerank，兼顾关键词精确匹配和语义理解。", 832, 306, 260, 150);
    addText(slide, "输出要求：答案附来源链接，知识可过期，命中质量可评测，查询日志可回流优化。", { left: 80, top: 548, width: 1000, height: 38 }, { fontSize: 24, bold: true });
    addSources(slide, ["docs/11-RAG-KNOWLEDGE.md", "docs/KB-DOCUMENT-PARSERS.md", "packages/kb/config/kb-freshness.yaml"]);
  }

  // 9
  {
    const slide = presentation.slides.add();
    addTitle(slide, "RAG Quality", "知识库不只回答问题，还持续提升客服质量", "企业级 RAG 的关键是权限、时效、评测和反馈回路，而不是简单向量搜索。", 9);
    addMetric(slide, "Freshness", "知识源更新、过期检测和版本记录，避免 AI 使用旧答案。", 80, 320, 240, 160);
    addMetric(slide, "Permission", "按 org、brand、角色和客户上下文过滤知识，避免越权引用。", 376, 320, 240, 160);
    addMetric(slide, "Evaluation", "Golden queries、命中率、引用覆盖和人工反馈用于持续评测。", 672, 320, 240, 160);
    addMetric(slide, "Traceability", "每条 AI 回复带来源、检索证据和生成路径，便于审计。", 968, 320, 240, 160);
    addText(slide, "结果：降低幻觉，提升首响质量，并让客服知识沉淀变成可运营资产。", { left: 80, top: 560, width: 980, height: 34 }, { fontSize: 24, bold: true });
    addSources(slide, ["docs/11-RAG-KNOWLEDGE.md", "docs/11-RAG-OPTIMIZATION.md", "docs/12-STORAGE-ABSTRACTION.md"]);
  }

  // 10
  {
    const slide = presentation.slides.add();
    addTitle(slide, "Memory", "Memory 让 Agent 记住客户、团队和长期上下文", "KeenAI 的 Memory 不是聊天记录缓存，而是服务于客户支持的长期知识层。", 10);
    addCard(slide, { title: "Customer memory", body: "客户偏好、历史问题、产品版本、购买计划、常见故障和满意度趋势。", left: 64, top: 320, width: 260, height: 176, accent: true });
    addCard(slide, { title: "Conversation memory", body: "当前对话的事实、已尝试方案、未解决问题和人工交接摘要。", left: 348, top: 320, width: 260, height: 176 });
    addCard(slide, { title: "Team memory", body: "团队处理偏好、宏模板、升级规则、成功案例和内部 SOP。", left: 632, top: 320, width: 260, height: 176 });
    addCard(slide, { title: "Product memory", body: "功能缺口、重复需求、Bug 模式和 Roadmap / Changelog 关联。", left: 916, top: 320, width: 260, height: 176 });
    addText(slide, "Memory 价值：减少重复询问，让 AI 和人工客服共享同一份可延续上下文。", { left: 64, top: 572, width: 1000, height: 34 }, { fontSize: 24, bold: true });
    addSources(slide, ["docs/10-AGENT-MEMORY.md", "docs/15-MEMORY-TREE.md", "packages/memory/src/layers.ts"]);
  }

  // 11
  {
    const slide = presentation.slides.add();
    addTitle(slide, "Memory Pipeline", "记忆需要抽取、压缩、冲突处理和遗忘机制", "企业客服里的记忆必须可信、可纠错、可删除，才能符合运营和合规要求。", 11);
    addStep(slide, "01", "Extract", "从对话、工单和反馈中抽取事实、偏好、实体、关系和待办。", 80, 314, 250, 150);
    addConnector(slide, 350, 372, 64);
    addStep(slide, "02", "Consolidate", "合并重复事实，压缩长对话，形成客户级、主题级和全局摘要树。", 434, 314, 250, 150);
    addConnector(slide, 704, 372, 64);
    addStep(slide, "03", "Validate", "用置信度、时间衰减和矛盾检测防止错误记忆污染回答。", 788, 314, 250, 150);
    addText(slide, "合规边界：支持数据导出、删除、审计和租户隔离；敏感信息经过 PII 处理后进入记忆层。", { left: 80, top: 548, width: 1050, height: 38 }, { fontSize: 23, bold: true });
    addSources(slide, ["docs/10-AGENT-MEMORY.md", "docs/15-MEMORY-TREE.md", "packages/memory/src/processors/pipeline.ts"]);
  }

  // 12
  {
    const slide = presentation.slides.add();
    addTitle(slide, "Workflow", "Workflow 把客服处理经验变成可配置、可追踪的自动化流程", "Trigger + Condition + Action，让企业不写代码也能沉淀标准流程。", 12);
    addCard(slide, { title: "Trigger", body: "客户发起新对话、邮件进入、Discord 提问、Ticket 状态变化、客户/客服超时未回复、定时任务、Webhook。", left: 80, top: 322, width: 300, height: 190, accent: true });
    addConnector(slide, 410, 397, 76);
    addCard(slide, { title: "Condition", body: "客户等级、渠道来源、工作时间、关键词/意图、AI 置信度、是否已有工单、SLA 状态。", left: 516, top: 322, width: 300, height: 190 });
    addConnector(slide, 846, 397, 76);
    addCard(slide, { title: "Action", body: "让 AI 回答、分配团队、创建 Ticket、应用 SLA、发送通知、调用 HTTP API / MCP、关闭或重开对话。", left: 952, top: 322, width: 248, height: 190 });
    addSources(slide, ["docs/13-WORKFLOW.md", "docs/02-FEATURES.md §1.5"]);
  }

  // 13
  {
    const slide = presentation.slides.add();
    addTitle(slide, "Workflow Blocks", "Block 列表覆盖 AI、消息、输入、流程控制、工单和集成", "Block 是可视化 Workflow Builder 的最小执行单元，运营团队可以组合成标准客服流程。", 13);
    addCard(slide, { title: "AI", body: "let_keeni_answer\n挂载 Keeni Agent，输出 resolution 并进入分支。", left: 64, top: 308, width: 260, height: 130, accent: true });
    addCard(slide, { title: "客户可见消息", body: "send_message\nshow_expected_reply_time", left: 348, top: 308, width: 260, height: 130 });
    addCard(slide, { title: "客户输入", body: "reply_buttons\ncollect_data\ncollect_customer_reply\ndisable_customer_reply\ncsat", left: 632, top: 308, width: 260, height: 130 });
    addCard(slide, { title: "流程控制", body: "branches\napply_rules\nwait\ngoto\nend", left: 916, top: 308, width: 260, height: 130 });
    addCard(slide, { title: "后台动作", body: "assign / mark_priority / apply_sla\nadd_note / tag_end_user / tag_conversation", left: 64, top: 484, width: 348, height: 130 });
    addCard(slide, { title: "状态与 Ticket", body: "snooze / close / reopen\nset_ticket_state / send_ticket_form / convert_to_ticket", left: 466, top: 484, width: 348, height: 130 });
    addCard(slide, { title: "集成扩展", body: "http_request / script\nwebhook_emit / mcp_call", left: 868, top: 484, width: 348, height: 130, accent: true });
    addSources(slide, ["docs/13-WORKFLOW.md §4.1 Block overview", "docs/02-FEATURES.md §1.5 Action Blocks"]);
  }

  // 14
  {
    const slide = presentation.slides.add();
    addTitle(slide, "Workflow Demo", "Demo 图：企业客户 Bug 反馈自动转工单并通知进度", "这条流程展示 Trigger、AI Block、条件分支、Ticket Block、SLA 和通知如何组合。", 14);
    addStep(slide, "01", "Trigger", "Enterprise 客户从 Discord 发送 “export failed” 反馈。", 74, 312, 270, 126);
    addConnector(slide, 362, 358, 64);
    addStep(slide, "02", "let_keeni_answer", "Agent 检索 RAG、读取 Memory，判断为 Bug，置信度 0.84。", 444, 312, 270, 126);
    addConnector(slide, 732, 358, 64);
    addStep(slide, "03", "branches", "如果 type = bug 且 plan = enterprise，进入高优先级路径。", 814, 312, 270, 126);
    slide.shapes.add({
      geometry: "downArrow",
      position: { left: 934, top: 454, width: 42, height: 58 },
      fill: C.primary,
      line: { style: "solid", fill: C.primary, width: 0 },
    });
    addStep(slide, "04", "convert_to_ticket", "创建 Customer Ticket，关联 conversation、证据和客户上下文。", 444, 520, 270, 126);
    addConnector(slide, 732, 566, 64);
    addStep(slide, "05", "assign + SLA + notify", "分配 Engineering Triage，应用 1 小时 SLA，并通知客户进度。", 814, 520, 270, 126);
    addText(slide, "结果：客户收到确认与进度通知；客服接手时工单、证据、SLA 和上下文已准备好。", { left: 74, top: 462, width: 720, height: 38 }, { fontSize: 21, bold: true });
    addSources(slide, ["docs/13-WORKFLOW.md §4 Action Block", "docs/01-PRD.md §3 Scenario B", "docs/02-FEATURES.md §1.5"]);
  }

  // 15
  {
    const slide = presentation.slides.add();
    addTitle(slide, "AI + RAG + Memory + Workflow", "四个核心能力组合，才是真正的企业级 AI 客服闭环", "RAG 提供事实，Memory 提供上下文，Agent 做判断和执行，Workflow 负责治理和编排。", 15);
    addShape(slide, { left: 136, top: 336, width: 190, height: 112 }, C.surface2, C.primary);
    addText(slide, "RAG\n事实与来源", { left: 166, top: 363, width: 130, height: 60 }, { fontSize: 24, bold: true, alignment: "center" });
    addConnector(slide, 342, 375, 70);
    addShape(slide, { left: 430, top: 336, width: 190, height: 112 }, C.surface2, C.primary);
    addText(slide, "Memory\n长期上下文", { left: 460, top: 363, width: 130, height: 60 }, { fontSize: 24, bold: true, alignment: "center" });
    addConnector(slide, 636, 375, 70);
    addShape(slide, { left: 724, top: 318, width: 214, height: 148 }, C.surface2, C.primary);
    addText(slide, "Keeni AI\nAgent", { left: 762, top: 358, width: 140, height: 62 }, { fontSize: 28, bold: true, alignment: "center", color: C.primaryHover });
    addConnector(slide, 954, 375, 70);
    addShape(slide, { left: 1042, top: 336, width: 170, height: 112 }, C.surface2, C.primary);
    addText(slide, "Workflow\n治理与动作", { left: 1070, top: 363, width: 114, height: 60 }, { fontSize: 23, bold: true, alignment: "center" });
    addText(slide, "同一个客户问题可以被理解、取证、记忆、执行、升级，并把结果沉淀回知识和流程。", { left: 102, top: 548, width: 1010, height: 38 }, { fontSize: 24, bold: true });
    addSources(slide, ["docs/04-MODULES.md AI Kernel", "docs/09-AGENT-ENGINE.md", "docs/10-AGENT-MEMORY.md", "docs/11-RAG-KNOWLEDGE.md", "docs/13-WORKFLOW.md"]);
  }

  // 16
  {
    const slide = presentation.slides.add();
    addTitle(slide, "Architecture", "技术方案兼顾开箱自托管、企业扩展和 AI 可替换", "TypeScript 全栈降低交付复杂度，双数据库后端覆盖轻量自托管和生产级部署。", 16);
    addCard(slide, { title: "Frontend & Channels", body: "Next.js Dashboard / Portal / Help Center；Preact Widget；WebSocket / SSE 实时体验。", left: 64, top: 300, width: 350, height: 154, accent: true });
    addCard(slide, { title: "Service & Storage", body: "Hono + Bun / Node；Drizzle；PostgreSQL + pgvector 或 SQLite / LibSQL；S3 / MinIO。", left: 466, top: 300, width: 350, height: 154 });
    addCard(slide, { title: "AI & Automation", body: "Vercel AI SDK；Mastra Agent；RAG；Memory；Inngest Workflow；BullMQ 队列。", left: 868, top: 300, width: 350, height: 154 });
    addMetric(slide, "Lite", "单机 Docker / SQLite，适合 Indie、Demo 和低成本自托管。", 64, 512, 250, 116);
    addMetric(slide, "Standard", "PostgreSQL + Redis + MinIO，适合中小团队生产部署。", 348, 512, 250, 116);
    addMetric(slide, "Cloud", "Vercel / Cloudflare / managed PG，适合托管 SaaS。", 632, 512, 250, 116);
    addMetric(slide, "Enterprise", "私有化、SSO、审计、SLA、本地模型和内网集成。", 916, 512, 250, 116);
    addSources(slide, ["README.md §3 Tech Stack", "docs/03-ARCHITECTURE.md", "docs/06-TECH-STACK.md", "docs/12-STORAGE-ABSTRACTION.md"]);
  }

  // 17
  {
    const slide = presentation.slides.add();
    addTitle(slide, "Business", "开源获客，云托管和企业私有化完成商业化", "KeenAI 以开源降低试用门槛，用企业级 AI、私有化和托管服务变现。", 17);
    addCard(slide, { title: "商业模式", body: "自托管 AGPL 免费获取社区和企业线索；云托管按 seat / AI 用量收费；企业版提供私有化、SSO、审计和 SLA。", left: 64, top: 294, width: 540, height: 150, accent: true });
    addCard(slide, { title: "GTM", body: "先抓开发者和 Indie Hacker，再进入中小 SaaS 团队，最后用私有化方案切企业内部 IT / DevTool。", left: 676, top: 294, width: 540, height: 150 });
    addRule(slide, 92, 536, 1040, C.hairlineStrong);
    const milestones = [
      ["0-3M", "MVP\nInbox / Widget / Email / Copilot"],
      ["3-6M", "Core loop\nTickets / Workflow / Feedback / Help Center"],
      ["6-9M", "AI full\nAgent / Memory / RAG / Roadmap / Changelog"],
      ["9-12M", "Commercial\nEnterprise / Cloud / Plugin ecosystem"],
    ];
    milestones.forEach(([date, body], i) => {
      const left = 92 + i * 334;
      slide.shapes.add({
        geometry: "ellipse",
        position: { left, top: 524, width: 22, height: 22 },
        fill: C.primary,
        line: { style: "solid", fill: C.primary, width: 0 },
      });
      addText(slide, date, { left: left - 4, top: 558, width: 80, height: 24 }, { fontSize: 16, bold: true });
      addText(slide, body, { left: left - 4, top: 590, width: 240, height: 64 }, { fontSize: 14, color: C.subtle });
    });
    addSources(slide, ["docs/01-PRD.md §4 Commercial goals", "docs/08-ROADMAP.md", "README.md §7 Roadmap Overview"]);
  }

  const sourceNotes = [
    "KeenAI BP linear expanded source notes",
    "Visual style: artifacts/presentations/linear.DESIGN.md from getdesign.md linear.app style.",
    "Primary repo sources: README.md; docs/01-PRD.md; docs/02-FEATURES.md; docs/03-ARCHITECTURE.md; docs/04-MODULES.md; docs/08-ROADMAP.md; docs/09-AGENT-ENGINE.md; docs/10-AGENT-MEMORY.md; docs/11-RAG-KNOWLEDGE.md; docs/13-WORKFLOW.md; docs/15-MEMORY-TREE.md.",
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
