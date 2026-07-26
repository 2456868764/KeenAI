import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Easing,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const C = {
  canvas: '#010102',
  panel: '#0f1011',
  panel2: '#141516',
  panel3: '#18191a',
  ink: '#f7f8f8',
  muted: '#d0d6e0',
  subtle: '#8a8f98',
  tertiary: '#62666d',
  line: '#23252a',
  strong: '#34343a',
  primary: '#5e6ad2',
  primary2: '#828fff',
  success: '#27a644',
  warning: '#f3b44e',
  danger: '#ff6b6b',
};

const W = 1920;
const H = 1080;
const FPS = 30;

const clamp = (v: number, min = 0, max = 1) => Math.max(min, Math.min(max, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t), 3);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const sec = (s: number) => Math.round(s * FPS);

type BoxProps = {
  children?: React.ReactNode;
  style?: React.CSSProperties;
};

const font: React.CSSProperties = {
  fontFamily: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
  letterSpacing: 0,
};

const mono: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  letterSpacing: 0,
};

const Shell: React.FC<BoxProps> = ({ children, style }) => (
  <AbsoluteFill
    style={{
      background: C.canvas,
      color: C.ink,
      overflow: 'hidden',
      ...font,
      ...style,
    }}
  >
    <GridBackground />
    {children}
  </AbsoluteFill>
);

const GridBackground: React.FC = () => (
  <AbsoluteFill>
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background:
          'radial-gradient(900px 540px at 74% 18%, rgba(94,106,210,0.16), transparent 64%), radial-gradient(680px 420px at 22% 78%, rgba(39,166,68,0.08), transparent 62%)',
      }}
    />
    <div
      style={{
        position: 'absolute',
        inset: 0,
        opacity: 0.18,
        backgroundImage:
          'linear-gradient(#23252a 1px, transparent 1px), linear-gradient(90deg, #23252a 1px, transparent 1px)',
        backgroundSize: '80px 80px',
        maskImage: 'radial-gradient(circle at 50% 42%, black, transparent 78%)',
      }}
    />
  </AbsoluteFill>
);

const Kicker: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div
    style={{
      color: C.primary2,
      fontSize: 20,
      fontWeight: 650,
      textTransform: 'uppercase',
      ...mono,
      ...style,
    }}
  >
    {children}
  </div>
);

const H1: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div
    style={{
      fontSize: 86,
      lineHeight: 1.05,
      fontWeight: 720,
      maxWidth: 980,
      ...style,
    }}
  >
    {children}
  </div>
);

const Copy: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ color: C.muted, fontSize: 28, lineHeight: 1.42, maxWidth: 900, ...style }}>{children}</div>
);

const Pill: React.FC<{ children: React.ReactNode; color?: string; style?: React.CSSProperties }> = ({
  children,
  color = C.primary,
  style,
}) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      height: 38,
      padding: '0 14px',
      borderRadius: 999,
      border: `1px solid ${color}`,
      background: `${color}22`,
      color: C.ink,
      fontSize: 16,
      fontWeight: 620,
      ...style,
    }}
  >
    {children}
  </div>
);

const Panel: React.FC<BoxProps> = ({ children, style }) => (
  <div
    style={{
      background: 'linear-gradient(180deg, rgba(20,21,22,0.96), rgba(15,16,17,0.96))',
      border: `1px solid ${C.line}`,
      borderRadius: 16,
      boxShadow: '0 24px 80px rgba(0,0,0,0.34)',
      ...style,
    }}
  >
    {children}
  </div>
);

const SceneLabel: React.FC<{ label: string; f: number }> = ({ label, f }) => {
  const p = spring({ frame: f, fps: FPS, config: { damping: 18, stiffness: 120 } });
  return (
    <div
      style={{
        position: 'absolute',
        left: 68,
        top: 48,
        opacity: clamp(p),
        transform: `translateY(${lerp(-20, 0, p)}px)`,
      }}
    >
      <Pill>{label}</Pill>
    </div>
  );
};

const Dots: React.FC<{ color?: string }> = ({ color = C.primary }) => (
  <div style={{ display: 'flex', gap: 8 }}>
    {[0, 1, 2].map((i) => (
      <div key={i} style={{ width: 10, height: 10, borderRadius: 10, background: i === 0 ? color : C.strong }} />
    ))}
  </div>
);

const WindowChrome: React.FC<BoxProps & { title: string; accent?: string }> = ({ title, accent = C.primary, children, style }) => (
  <Panel style={{ overflow: 'hidden', ...style }}>
    <div
      style={{
        height: 58,
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        borderBottom: `1px solid ${C.line}`,
        padding: '0 22px',
      }}
    >
      <Dots color={accent} />
      <div style={{ color: C.subtle, fontSize: 15, ...mono }}>{title}</div>
      <div style={{ marginLeft: 'auto', width: 116, height: 8, borderRadius: 8, background: C.line }} />
    </div>
    {children}
  </Panel>
);

const MetricCard: React.FC<{ title: string; value: string; color?: string; active?: number }> = ({
  title,
  value,
  color = C.primary,
  active = 1,
}) => (
  <Panel
    style={{
      padding: 24,
      opacity: active,
      transform: `translateY(${(1 - active) * 18}px) scale(${0.98 + active * 0.02})`,
      minHeight: 150,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ color: C.subtle, fontSize: 18 }}>{title}</div>
      <div style={{ width: 12, height: 12, borderRadius: 12, background: color, boxShadow: `0 0 24px ${color}` }} />
    </div>
    <div style={{ fontSize: 46, fontWeight: 720, marginTop: 20 }}>{value}</div>
  </Panel>
);

const SceneTitle: React.FC = () => {
  const f = useCurrentFrame();
  const titleIn = spring({ frame: f - 16, fps: FPS, config: { damping: 18, stiffness: 90 } });
  const cam = interpolate(f, [0, 220], [0, 1], { extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
  const dataRows = ['Widget conversation', 'Email escalation', 'Discord bug report', 'Knowledge article', 'Workflow event'];

  return (
    <Shell>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: W,
          height: H,
          perspective: 1300,
          transformStyle: 'preserve-3d',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 260,
            top: 230,
            width: 1340,
            height: 660,
            transform: `rotateX(${lerp(56, 48, cam)}deg) rotateZ(-13deg) translateX(${lerp(160, -90, cam)}px)`,
            transformStyle: 'preserve-3d',
          }}
        >
          <WindowChrome title="keenai://ops-console" style={{ width: 1240, height: 620, transform: 'translateZ(0px)' }}>
            <div style={{ padding: 34, display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 22 }}>
              <div>
                {dataRows.map((row, i) => (
                  <div
                    key={row}
                    style={{
                      height: 66,
                      marginBottom: 14,
                      borderRadius: 12,
                      background: i === 2 ? 'rgba(94,106,210,0.22)' : C.panel2,
                      border: `1px solid ${i === 2 ? C.primary : C.line}`,
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0 20px',
                      gap: 16,
                      fontSize: 18,
                      color: i === 2 ? C.ink : C.subtle,
                    }}
                  >
                    <div style={{ width: 12, height: 12, borderRadius: 12, background: i === 2 ? C.primary2 : C.strong }} />
                    {row}
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gap: 16 }}>
                {['AI answer drafted', 'Ticket routed', 'Evidence cited'].map((row, i) => (
                  <Panel key={row} style={{ padding: 24, opacity: 0.85 + i * 0.05 }}>
                    <div style={{ color: C.subtle, fontSize: 15, ...mono }}>0{i + 1}</div>
                    <div style={{ marginTop: 12, fontSize: 24, fontWeight: 680 }}>{row}</div>
                  </Panel>
                ))}
              </div>
            </div>
          </WindowChrome>
          <div
            style={{
              position: 'absolute',
              left: 60,
              top: 140,
              transform: 'translateZ(170px)',
              opacity: clamp(titleIn),
            }}
          >
            <div style={{ fontSize: 168, lineHeight: 0.92, fontWeight: 780 }}>KeenAI</div>
            <div style={{ marginTop: 34, fontSize: 38, color: C.muted, maxWidth: 900 }}>
              AI-native support operating system
            </div>
          </div>
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 70,
          bottom: 58,
          display: 'flex',
          gap: 12,
          opacity: interpolate(f, [110, 140], [0, 1], { extrapolateRight: 'clamp' }),
        }}
      >
        {['Agent', 'RAG', 'Memory', 'Workflow', 'Multi-channel'].map((x) => (
          <Pill key={x}>{x}</Pill>
        ))}
      </div>
    </Shell>
  );
};

const ScenePains: React.FC = () => {
  const f = useCurrentFrame();
  const grow = easeOut(f / 28);
  const snap = f >= 160 ? C.success : C.primary;
  const flash = f >= 160 && f < 164 ? interpolate(f, [160, 164], [0.42, 0], { extrapolateRight: 'clamp' }) : 0;
  const cards = [
    ['成本不可控', 'Support seat + AI usage 双重上升', C.warning],
    ['渠道分散', 'Email / Discord / Widget 各说各话', C.primary2],
    ['答案不可信', 'AI 没有证据链，团队不敢放权', C.danger],
    ['流程不稳定', '人工转派、SLA、升级规则靠人记', C.success],
  ];

  return (
    <Shell>
      <SceneLabel label="01 / enterprise pain" f={f} />
      <div
        style={{
          position: 'absolute',
          inset: 34 + grow * 18,
          border: `${Math.max(0, 34 * grow)}px solid ${snap}`,
          borderRadius: 24,
          boxSizing: 'border-box',
          transition: 'none',
        }}
      />
      <div style={{ position: 'absolute', left: 132, top: 154 }}>
        <Kicker>真实企业痛点</Kicker>
        <H1 style={{ marginTop: 22, maxWidth: 980 }}>客服系统不是缺聊天框，而是缺可控的执行层。</H1>
        <Copy style={{ marginTop: 34 }}>
          KeenAI 把入口、知识、记忆和自动化放在同一个自托管工作面，降低成本，同时保留数据控制权。
        </Copy>
      </div>
      <div
        style={{
          position: 'absolute',
          right: 120,
          top: 185,
          width: 650,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 18,
        }}
      >
        {cards.map(([title, desc, color], i) => {
          const a = spring({ frame: f - 34 - i * 12, fps: FPS, config: { damping: 17, stiffness: 120 } });
          return (
            <Panel
              key={title}
              style={{
                height: 245,
                padding: 28,
                opacity: clamp(a),
                transform: `translateY(${lerp(42, 0, a)}px)`,
              }}
            >
              <div style={{ width: 42, height: 42, borderRadius: 12, background: `${color}26`, border: `1px solid ${color}` }} />
              <div style={{ marginTop: 28, fontSize: 30, fontWeight: 720 }}>{title}</div>
              <div style={{ marginTop: 14, color: C.subtle, fontSize: 19, lineHeight: 1.35 }}>{desc}</div>
            </Panel>
          );
        })}
      </div>
      {flash > 0 && <AbsoluteFill style={{ background: '#fff', opacity: flash }} />}
    </Shell>
  );
};

const ChannelNode: React.FC<{ label: string; x: number; y: number; color: string; f: number; delay: number }> = ({
  label,
  x,
  y,
  color,
  f,
  delay,
}) => {
  const p = spring({ frame: f - delay, fps: FPS, config: { damping: 16, stiffness: 110 } });
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: 142,
        height: 142,
        borderRadius: 28,
        background: '#f9f9fa',
        color: '#111',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 10,
        opacity: clamp(p),
        transform: `translate(-50%, -50%) scale(${0.75 + 0.25 * p})`,
        boxShadow: `0 0 ${24 + p * 42}px ${color}66`,
      }}
    >
      <div style={{ width: 42, height: 42, borderRadius: 12, background: color }} />
      <div style={{ fontSize: 18, fontWeight: 740 }}>{label}</div>
    </div>
  );
};

const SceneChannels: React.FC = () => {
  const f = useCurrentFrame();
  const nodes = [
    ['Widget', 300, 280, '#5e6ad2'],
    ['Email', 520, 735, '#f3b44e'],
    ['Discord', 1420, 285, '#5865f2'],
    ['Slack', 1620, 710, '#27a644'],
    ['API', 960, 850, '#828fff'],
    ['Telegram', 220, 565, '#26a5e4'],
    ['MCP', 1700, 500, '#ff6b6b'],
  ] as const;
  const draw = easeOut((f - 50) / 100);
  const pulse = 0.5 + 0.5 * Math.sin(f * 0.16);

  return (
    <Shell>
      <SceneLabel label="02 / multi-channel intake" f={f} />
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <linearGradient id="lineGrad" x1="0" x2="1">
            <stop offset="0%" stopColor={C.primary} />
            <stop offset="100%" stopColor={C.primary2} />
          </linearGradient>
        </defs>
        {nodes.map(([label, x, y], i) => {
          const dash = 820;
          return (
            <path
              key={label}
              d={`M ${x} ${y} Q ${lerp(x, 960, 0.55)} ${lerp(y, 540, 0.55) - 60} 960 540`}
              stroke="url(#lineGrad)"
              strokeWidth={3}
              fill="none"
              strokeDasharray={dash}
              strokeDashoffset={dash * (1 - draw)}
              opacity={0.25 + draw * 0.55}
            />
          );
        })}
      </svg>
      <Panel
        style={{
          position: 'absolute',
          left: 710,
          top: 295,
          width: 500,
          height: 490,
          borderRadius: 32,
          padding: 38,
          boxShadow: `0 0 ${50 + pulse * 55}px rgba(94,106,210,0.35), 0 24px 90px rgba(0,0,0,0.42)`,
        }}
      >
        <Kicker>KeenAI Inbox</Kicker>
        <div style={{ fontSize: 48, lineHeight: 1.08, fontWeight: 760, marginTop: 22 }}>所有入口进入同一个执行队列</div>
        <div style={{ marginTop: 28, color: C.subtle, fontSize: 22, lineHeight: 1.42 }}>
          自动识别客户、主题、优先级、证据来源和下一步动作。
        </div>
        <div style={{ marginTop: 34, display: 'grid', gap: 12 }}>
          {['classify_intent', 'retrieve_context', 'route_or_answer'].map((x, i) => (
            <div key={x} style={{ display: 'flex', alignItems: 'center', gap: 14, color: C.muted, fontSize: 18, ...mono }}>
              <div style={{ width: 9, height: 9, borderRadius: 9, background: i === 2 ? C.success : C.primary2 }} />
              {x}
            </div>
          ))}
        </div>
      </Panel>
      {nodes.map(([label, x, y, color], i) => (
        <ChannelNode key={label} label={label} x={x} y={y} color={color} f={f} delay={20 + i * 8} />
      ))}
    </Shell>
  );
};

const ConsoleCard: React.FC<{ title: string; subtitle: string; i: number; f: number }> = ({ title, subtitle, i, f }) => {
  const start = 42 + i * 5;
  const p = interpolate(f, [start, start + 28], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });
  const rowX = 82 + i * 274;
  const grid = [
    [92, 152],
    [92, 452],
    [560, 152],
    [560, 452],
    [1028, 152],
    [1028, 452],
  ][i];
  const x = lerp(rowX, grid[0], p);
  const y = lerp(335, grid[1], p);
  const scale = lerp(0.86, 1, p);

  return (
    <Panel
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: 400,
        height: 236,
        padding: 26,
        transform: `scale(${scale})`,
        transformOrigin: '50% 50%',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ color: C.subtle, fontSize: 15, ...mono }}>0{i + 1}</div>
        <div style={{ width: 50, height: 8, borderRadius: 8, background: i % 2 ? C.success : C.primary }} />
      </div>
      <div style={{ marginTop: 28, fontSize: 30, fontWeight: 720 }}>{title}</div>
      <div style={{ marginTop: 16, color: C.subtle, fontSize: 18, lineHeight: 1.38 }}>{subtitle}</div>
    </Panel>
  );
};

const SceneConsole: React.FC = () => {
  const f = useCurrentFrame();
  const items = [
    ['Inbox', '多渠道消息统一进入 AI 队列'],
    ['Tickets', '客服工单、SLA、负责人'],
    ['Knowledge', '帮助中心、文档、FAQ'],
    ['Roadmap', '反馈聚类到产品路线图'],
    ['Memory', '客户与团队长期上下文'],
    ['Workflow', '触发、判断、动作自动执行'],
  ];
  const pulse = f > 188 && f < 208 ? interpolate(f, [188, 198, 208], [1, 0.78, 1], { extrapolateRight: 'clamp' }) : 1;

  return (
    <Shell style={{ filter: `brightness(${pulse})` }}>
      <SceneLabel label="03 / operating console" f={f} />
      <div style={{ position: 'absolute', left: 88, top: 86 }}>
        <Kicker>统一工作面</Kicker>
        <H1 style={{ marginTop: 18, fontSize: 68, maxWidth: 1380 }}>从“消息”到“行动”，不再跨系统搬运上下文。</H1>
      </div>
      <WindowChrome title="keenai.app/workspace" style={{ position: 'absolute', left: 258, top: 224, width: 1404, height: 780 }}>
        <div style={{ position: 'relative', height: 720 }}>{items.map(([title, subtitle], i) => <ConsoleCard key={title} title={title} subtitle={subtitle} i={i} f={f} />)}</div>
      </WindowChrome>
    </Shell>
  );
};

const StreamRow: React.FC<{ text: string; i: number; f: number; color?: string }> = ({ text, i, f, color = C.primary2 }) => {
  const p = spring({ frame: f - 72 - i * 18, fps: FPS, config: { damping: 18, stiffness: 120 } });
  return (
    <div
      style={{
        height: 64,
        borderRadius: 13,
        border: `1px solid ${C.line}`,
        background: C.panel2,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '0 18px',
        opacity: clamp(p),
        transform: `translateX(${lerp(48, 0, p)}px)`,
      }}
    >
      <div style={{ width: 13, height: 13, borderRadius: 13, background: color, boxShadow: `0 0 20px ${color}` }} />
      <div style={{ fontSize: 20, color: C.muted }}>{text}</div>
    </div>
  );
};

const SceneAgent: React.FC = () => {
  const f = useCurrentFrame();
  const cursor = f % 22 < 11 ? 1 : 0;
  const typed = '已识别：企业客户在 Discord 反馈 P1 登录缺陷。';
  const n = Math.floor(interpolate(f, [22, 92], [0, typed.length], { extrapolateRight: 'clamp' }));
  const done = f > 285;

  return (
    <Shell>
      <SceneLabel label="04 / Keeni AI Agent" f={f} />
      <div style={{ position: 'absolute', left: 100, top: 150, width: 680 }}>
        <Kicker>Agent, not chatbot</Kicker>
        <H1 style={{ marginTop: 22, fontSize: 76 }}>Keeni 不只是回复，它把消息变成可审计的工作。</H1>
        <Copy style={{ marginTop: 30 }}>
          识别意图、检索证据、调用工具、判断是否需要人工审批，并把结果写回企业系统。
        </Copy>
      </div>
      <WindowChrome title="keeni.agent/run/answer-with-actions" style={{ position: 'absolute', right: 112, top: 132, width: 940, height: 815 }}>
        <div style={{ padding: 34 }}>
          <div
            style={{
              borderRadius: 18,
              background: 'rgba(94,106,210,0.14)',
              border: `1px solid ${C.primary}`,
              padding: 26,
              minHeight: 142,
              fontSize: 29,
              lineHeight: 1.38,
            }}
          >
            {typed.slice(0, n)}
            <span style={{ opacity: cursor, color: C.primary2 }}>|</span>
          </div>
          <div style={{ display: 'grid', gap: 14, marginTop: 24 }}>
            <StreamRow f={f} i={0} text="RAG: 找到 3 篇相关知识库文章和 1 条历史工单" />
            <StreamRow f={f} i={1} text="Memory: 识别客户为 Enterprise / SLA 2h" color={C.success} />
            <StreamRow f={f} i={2} text="Tool: 创建 ticket，关联 roadmap feedback cluster" color={C.warning} />
            <StreamRow f={f} i={3} text="Draft: 生成带引用的客户回复，等待人工确认" />
          </div>
          <div
            style={{
              marginTop: 30,
              height: 82,
              borderRadius: 16,
              background: done ? 'rgba(39,166,68,0.16)' : C.panel2,
              border: `1px solid ${done ? C.success : C.line}`,
              display: 'flex',
              alignItems: 'center',
              padding: '0 24px',
              gap: 18,
              fontSize: 23,
              fontWeight: 680,
            }}
          >
            <div style={{ width: 18, height: 18, borderRadius: 18, background: done ? C.success : C.primary2 }} />
            {done ? '完成：回答、工单、通知、审计日志已生成' : '正在汇总证据链...'}
          </div>
        </div>
      </WindowChrome>
    </Shell>
  );
};

const PipeBlock: React.FC<{ title: string; sub: string; x: number; y: number; f: number; delay: number; color?: string }> = ({
  title,
  sub,
  x,
  y,
  f,
  delay,
  color = C.primary,
}) => {
  const p = spring({ frame: f - delay, fps: FPS, config: { damping: 16, stiffness: 110 } });
  return (
    <Panel
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: 280,
        height: 168,
        padding: 22,
        opacity: clamp(p),
        transform: `scale(${0.86 + p * 0.14})`,
      }}
    >
      <div style={{ width: 38, height: 8, borderRadius: 8, background: color }} />
      <div style={{ marginTop: 22, fontSize: 25, fontWeight: 720 }}>{title}</div>
      <div style={{ marginTop: 10, fontSize: 16, lineHeight: 1.35, color: C.subtle }}>{sub}</div>
    </Panel>
  );
};

const SceneRag: React.FC = () => {
  const f = useCurrentFrame();
  const blocks = [
    ['Sources', 'Docs / FAQ / Tickets', 150, 245, C.primary],
    ['Chunk', 'clean + split + enrich', 472, 245, C.primary2],
    ['Embed', 'hybrid vector search', 794, 245, C.warning],
    ['Retrieve', 'rank + permission filter', 1116, 245, C.success],
    ['Cite', 'answer with sources', 1438, 245, C.primary],
  ] as const;
  const draw = easeOut((f - 50) / 110);

  return (
    <Shell>
      <SceneLabel label="05 / RAG + knowledge base" f={f} />
      <div style={{ position: 'absolute', left: 104, top: 98 }}>
        <Kicker>知识库不是附件，是 Agent 的证据层</Kicker>
        <H1 style={{ marginTop: 18, fontSize: 66, maxWidth: 1350 }}>先检索，再生成；每个回答都能回到原始资料。</H1>
      </div>
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        {blocks.slice(0, -1).map((b, i) => (
          <path
            key={b[0]}
            d={`M ${b[2] + 280} ${b[3] + 84} C ${b[2] + 345} ${b[3] + 84}, ${blocks[i + 1][2] - 65} ${b[3] + 84}, ${blocks[i + 1][2]} ${b[3] + 84}`}
            stroke={C.primary2}
            strokeWidth={4}
            fill="none"
            strokeDasharray={320}
            strokeDashoffset={320 * (1 - draw)}
            opacity={0.72}
          />
        ))}
      </svg>
      {blocks.map(([title, sub, x, y, color], i) => (
        <PipeBlock key={title} title={title} sub={sub} x={x} y={y} color={color} f={f} delay={30 + i * 16} />
      ))}
      <WindowChrome title="knowledge.answer/citations" style={{ position: 'absolute', left: 274, top: 550, width: 1370, height: 350 }}>
        <div style={{ padding: 30, display: 'grid', gridTemplateColumns: '1fr 0.9fr', gap: 28 }}>
          <div>
            <div style={{ fontSize: 30, lineHeight: 1.4, fontWeight: 680 }}>
              “登录失败是已知 P1 问题，建议先启用备用 OAuth callback，并附上修复 ETA。”
            </div>
            <div style={{ marginTop: 20, color: C.subtle, fontSize: 19, lineHeight: 1.45 }}>
              生成结果必须携带知识库来源、历史工单和权限过滤记录。
            </div>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            {['KB-042 OAuth 回调异常', 'Ticket #1832 Enterprise Login', 'Runbook: P1 escalation'].map((x, i) => (
              <div key={x} style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 16, color: C.muted, fontSize: 17 }}>
                [{i + 1}] {x}
              </div>
            ))}
          </div>
        </div>
      </WindowChrome>
    </Shell>
  );
};

const SceneMemory: React.FC = () => {
  const f = useCurrentFrame();
  const layers = [
    ['Customer Memory', '套餐、SLA、历史风险、关键联系人'],
    ['Conversation Memory', '当前问题、已尝试动作、情绪状态'],
    ['Product Memory', '模块、版本、已知缺陷、路线图聚类'],
    ['Team Memory', '谁负责、审批规则、升级路径'],
  ];

  return (
    <Shell>
      <SceneLabel label="06 / memory" f={f} />
      <div style={{ position: 'absolute', left: 112, top: 110, width: 650 }}>
        <Kicker>可持续上下文</Kicker>
        <H1 style={{ marginTop: 22, fontSize: 72 }}>企业 Agent 的关键不是“聪明一次”，而是“记得住”。</H1>
      </div>
      <div style={{ position: 'absolute', right: 125, top: 146, width: 910, height: 760 }}>
        {layers.map(([title, sub], i) => {
          const p = spring({ frame: f - 35 - i * 24, fps: FPS, config: { damping: 17, stiffness: 110 } });
          const breathe = 1 + Math.sin((f + i * 21) * 0.04) * 0.012;
          return (
            <Panel
              key={title}
              style={{
                position: 'absolute',
                left: i * 42,
                top: i * 108,
                width: 800 - i * 28,
                height: 225,
                padding: 30,
                opacity: clamp(p),
                transform: `translateY(${lerp(68, 0, p)}px) scale(${breathe})`,
                borderColor: i === 0 ? C.primary : C.line,
              }}
            >
              <div style={{ color: C.primary2, fontSize: 18, ...mono }}>memory.layer.0{i + 1}</div>
              <div style={{ marginTop: 18, fontSize: 38, fontWeight: 730 }}>{title}</div>
              <div style={{ marginTop: 16, color: C.subtle, fontSize: 22, lineHeight: 1.36 }}>{sub}</div>
            </Panel>
          );
        })}
      </div>
      <Panel style={{ position: 'absolute', left: 112, bottom: 84, width: 630, padding: 26 }}>
        <div style={{ color: C.subtle, fontSize: 20, lineHeight: 1.45 }}>
          Memory 不是无限聊天记录，而是可治理、可更新、可删除的结构化事实层。
        </div>
      </Panel>
    </Shell>
  );
};

const WorkflowBlock: React.FC<{ label: string; sub: string; x: number; y: number; color: string; f: number; delay: number }> = ({
  label,
  sub,
  x,
  y,
  color,
  f,
  delay,
}) => {
  const p = spring({ frame: f - delay, fps: FPS, config: { damping: 16, stiffness: 120 } });
  return (
    <Panel
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: 320,
        height: 168,
        padding: 24,
        opacity: clamp(p),
        transform: `translateY(${lerp(36, 0, p)}px)`,
        borderColor: color,
      }}
    >
      <div style={{ color, fontSize: 16, fontWeight: 750, ...mono }}>{label}</div>
      <div style={{ marginTop: 18, fontSize: 26, fontWeight: 720 }}>{sub}</div>
    </Panel>
  );
};

const SceneWorkflow: React.FC = () => {
  const f = useCurrentFrame();
  const blocks = [
    ['TRIGGER', 'message.created', 165, 310, C.primary],
    ['CONDITION', 'priority = P1', 565, 310, C.warning],
    ['ACTION', 'create ticket', 965, 310, C.success],
    ['ACTION', 'notify owner', 1365, 310, C.primary2],
  ] as const;
  const draw = easeOut((f - 58) / 92);

  return (
    <Shell>
      <SceneLabel label="07 / workflow blocks" f={f} />
      <div style={{ position: 'absolute', left: 110, top: 96 }}>
        <Kicker>流程，Block 列表，Demo 图示例</Kicker>
        <H1 style={{ marginTop: 18, fontSize: 64, maxWidth: 1280 }}>Workflow = Trigger → Condition → Action，AI 决策必须能落地执行。</H1>
      </div>
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        {blocks.slice(0, -1).map((b, i) => (
          <path
            key={b[0] + i}
            d={`M ${b[2] + 320} ${b[3] + 84} L ${blocks[i + 1][2]} ${blocks[i + 1][3] + 84}`}
            stroke={C.primary2}
            strokeWidth={5}
            fill="none"
            strokeDasharray={430}
            strokeDashoffset={430 * (1 - draw)}
            opacity={0.72}
          />
        ))}
      </svg>
      {blocks.map(([label, sub, x, y, color], i) => (
        <WorkflowBlock key={label + sub} label={label} sub={sub} x={x} y={y} color={color} f={f} delay={32 + i * 18} />
      ))}
      <div style={{ position: 'absolute', left: 162, bottom: 100, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 18, width: 1596 }}>
        {[
          ['Input', '表单、消息、Webhook'],
          ['AI', '分类、摘要、提取'],
          ['Human', '审批、转派、确认'],
          ['Tool', 'CRM、Ticket、Roadmap'],
          ['Output', '回复、通知、审计日志'],
        ].map(([a, b], i) => (
          <Panel key={a} style={{ padding: 22, height: 142 }}>
            <div style={{ color: C.primary2, fontSize: 17, ...mono }}>{a}</div>
            <div style={{ color: C.muted, fontSize: 20, lineHeight: 1.35, marginTop: 18 }}>{b}</div>
          </Panel>
        ))}
      </div>
    </Shell>
  );
};

const SceneWorkflowDemo: React.FC = () => {
  const f = useCurrentFrame();
  const steps = [
    ['Discord', '客户在企业频道反馈登录失败'],
    ['let_keeni_answer', 'AI 生成带引用的初稿'],
    ['branches', 'P1 + Enterprise → 升级'],
    ['convert_to_ticket', '创建 Ticket 并关联客户'],
    ['assign + SLA', '指派 Owner，2 小时 SLA'],
    ['notify', '回写 Discord + Email 通知'],
  ];

  return (
    <Shell>
      <SceneLabel label="08 / workflow demo" f={f} />
      <div style={{ position: 'absolute', left: 100, top: 92 }}>
        <Kicker>Demo: Discord bug → ticket → SLA</Kicker>
        <H1 style={{ marginTop: 18, fontSize: 62, maxWidth: 1380 }}>一个真实企业问题，从对话入口自动变成可追踪工单。</H1>
      </div>
      <div style={{ position: 'absolute', left: 115, top: 288, width: 1690, height: 600 }}>
        {steps.map(([title, sub], i) => {
          const p = spring({ frame: f - 30 - i * 18, fps: FPS, config: { damping: 16, stiffness: 110 } });
          const x = 32 + i * 270;
          const y = i % 2 === 0 ? 70 : 250;
          return (
            <React.Fragment key={title}>
              {i < steps.length - 1 && (
                <div
                  style={{
                    position: 'absolute',
                    left: x + 228,
                    top: y + 84,
                    width: 110,
                    height: 3,
                    background: C.primary2,
                    opacity: clamp(p) * 0.55,
                    transform: `rotate(${i % 2 === 0 ? 26 : -26}deg)`,
                  }}
                />
              )}
              <Panel
                style={{
                  position: 'absolute',
                  left: x,
                  top: y,
                  width: 250,
                  height: 168,
                  padding: 22,
                  opacity: clamp(p),
                  transform: `scale(${0.84 + 0.16 * p})`,
                  borderColor: i === 2 ? C.warning : i > 2 ? C.success : C.line,
                }}
              >
                <div style={{ color: i === 2 ? C.warning : C.primary2, fontSize: 15, ...mono }}>{String(i + 1).padStart(2, '0')}</div>
                <div style={{ marginTop: 14, fontSize: 24, fontWeight: 720 }}>{title}</div>
                <div style={{ marginTop: 12, color: C.subtle, fontSize: 16, lineHeight: 1.35 }}>{sub}</div>
              </Panel>
            </React.Fragment>
          );
        })}
      </div>
      <WindowChrome title="audit.log" style={{ position: 'absolute', left: 338, bottom: 78, width: 1244, height: 156 }}>
        <div style={{ padding: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {['Evidence cited', 'Human approval', 'Tool call result', 'Customer notified'].map((x) => (
            <Pill key={x} color={x === 'Human approval' ? C.warning : C.success}>
              {x}
            </Pill>
          ))}
        </div>
      </WindowChrome>
    </Shell>
  );
};

const SceneBusiness: React.FC = () => {
  const f = useCurrentFrame();
  const customers = [
    ['SaaS CTO / Founder', '需要低成本、自托管、可扩展的 AI support stack'],
    ['Support Leader', '要降低一线重复回复和跨系统查证时间'],
    ['Enterprise IT / Helpdesk', '要权限、审计、审批、SLA 与本地部署'],
    ['Product Team', '把反馈自动聚类到 roadmap 和 changelog'],
  ];
  const packages = [
    ['Lite', '开源自部署 / 个体团队'],
    ['Standard', '团队工作区 + Workflow'],
    ['Cloud', '托管版 + 多租户 + 扩展集成'],
    ['Enterprise', 'SSO / RBAC / 私有化 / 合规'],
  ];
  const travel = easeInOut((f - 22) / 210);

  return (
    <Shell>
      <SceneLabel label="09 / commercial plan" f={f} />
      <div style={{ position: 'absolute', left: 96, top: 90 }}>
        <Kicker>商业规划与目标客户画像</Kicker>
        <H1 style={{ marginTop: 18, fontSize: 62, maxWidth: 1300 }}>先从高频客服与反馈场景切入，再扩展成企业 AI 执行平台。</H1>
      </div>
      <div style={{ position: 'absolute', left: 116, top: 270, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, width: 820 }}>
        {customers.map(([a, b], i) => {
          const p = spring({ frame: f - 32 - i * 10, fps: FPS, config: { damping: 17, stiffness: 110 } });
          return (
            <Panel key={a} style={{ padding: 24, height: 160, opacity: clamp(p), transform: `translateY(${lerp(34, 0, p)}px)` }}>
              <div style={{ color: C.primary2, fontSize: 22, fontWeight: 720 }}>{a}</div>
              <div style={{ color: C.subtle, marginTop: 14, fontSize: 17, lineHeight: 1.36 }}>{b}</div>
            </Panel>
          );
        })}
      </div>
      <div style={{ position: 'absolute', right: 126, top: 300, width: 760, height: 490 }}>
        <svg width={760} height={490} style={{ position: 'absolute' }}>
          <path d="M 80 250 C 210 105, 360 105, 492 250 S 650 398, 700 250" fill="none" stroke={C.strong} strokeWidth={8} />
          <path
            d="M 80 250 C 210 105, 360 105, 492 250 S 650 398, 700 250"
            fill="none"
            stroke={C.primary2}
            strokeWidth={8}
            strokeDasharray={900}
            strokeDashoffset={900 * (1 - travel)}
          />
        </svg>
        {packages.map(([a, b], i) => {
          const x = [60, 230, 410, 610][i];
          const y = [250, 132, 250, 326][i];
          const p = spring({ frame: f - 48 - i * 24, fps: FPS, config: { damping: 16, stiffness: 110 } });
          return (
            <Panel
              key={a}
              style={{
                position: 'absolute',
                left: x - 70,
                top: y - 70,
                width: 178,
                height: 140,
                padding: 18,
                opacity: clamp(p),
                transform: `scale(${0.78 + p * 0.22})`,
              }}
            >
              <div style={{ fontSize: 27, fontWeight: 750 }}>{a}</div>
              <div style={{ color: C.subtle, fontSize: 15, lineHeight: 1.34, marginTop: 12 }}>{b}</div>
            </Panel>
          );
        })}
      </div>
    </Shell>
  );
};

const SceneOutro: React.FC = () => {
  const f = useCurrentFrame();
  const elements = [
    ['Agent', -520, -220, -5],
    ['RAG', 500, -190, 4],
    ['Memory', -620, 125, 3],
    ['Workflow', 570, 135, -4],
    ['Channels', 0, 325, 2],
  ] as const;
  const word = spring({ frame: f - 70, fps: FPS, config: { damping: 18, stiffness: 95 } });
  const fade = interpolate(f, [128, 150], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <Shell style={{ opacity: fade }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(900px 520px at 50% 52%, rgba(94,106,210,0.26), transparent 70%)',
        }}
      />
      {elements.map(([label, dx, dy, rot], i) => {
        const p = spring({ frame: f - 6 - i * 9, fps: FPS, config: { damping: 14, stiffness: 120 } });
        const recede = 1 - 0.24 * word;
        return (
          <Panel
            key={label}
            style={{
              position: 'absolute',
              left: 960 - 150,
              top: 520 - 78,
              width: 300,
              height: 156,
              padding: 24,
              opacity: clamp(p) * (1 - 0.94 * word),
              transform: `translate(${dx * (1 - p)}px, ${dy * (1 - p)}px) rotate(${rot * (1 - p)}deg) scale(${(0.82 + 0.18 * p) * recede})`,
              borderColor: i === 3 ? C.success : C.line,
              filter: `saturate(${1 - 0.35 * word})`,
            }}
          >
            <div style={{ color: C.primary2, fontSize: 16, ...mono }}>keenai.module</div>
            <div style={{ marginTop: 18, fontSize: 34, fontWeight: 740 }}>{label}</div>
          </Panel>
        );
      })}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 420,
          textAlign: 'center',
          opacity: clamp(word),
          transform: `scale(${0.88 + 0.12 * word})`,
        }}
      >
        <div style={{ fontSize: 118, fontWeight: 790 }}>KeenAI</div>
        <div style={{ color: C.muted, marginTop: 24, fontSize: 34 }}>让企业 AI 从“会回答”走向“会执行”。</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginTop: 42 }}>
          {['Open-source', 'Self-hostable', 'Agent + RAG + Workflow'].map((x) => (
            <Pill key={x}>{x}</Pill>
          ))}
        </div>
      </div>
    </Shell>
  );
};

const SoundBed: React.FC = () => {
  const sfx = [
    [sec(8), 'transition-snap.mp3', 0.45],
    [sec(18), 'whoosh-fast.mp3', 0.35],
    [sec(30), 'transition-soft.mp3', 0.35],
    [sec(42), 'keyboard.mp3', 0.24],
    [sec(55), 'sparkle.mp3', 0.32],
    [sec(68), 'whoosh-big.mp3', 0.28],
    [sec(80), 'click-camera.mp3', 0.24],
    [sec(94), 'transition-snap.mp3', 0.42],
    [sec(106), 'riser-cine.mp3', 0.22],
    [sec(115), 'impact-cine.mp3', 0.3],
  ] as const;
  return (
    <>
      <Audio src={staticFile('audio/bgm-tech-house.mp3')} volume={0.18} />
      {sfx.map(([from, file, volume]) => (
        <Sequence key={`${from}-${file}`} from={from}>
          <Audio src={staticFile(`audio/${file}`)} volume={volume} />
        </Sequence>
      ))}
    </>
  );
};

export const KeenAiShotcraft: React.FC = () => {
  const { fps } = useVideoConfig();
  if (fps !== FPS) {
    throw new Error(`Expected ${FPS}fps`);
  }
  return (
    <AbsoluteFill style={{ background: C.canvas }}>
      <SoundBed />
      <Sequence from={sec(0)} durationInFrames={sec(8)}>
        <SceneTitle />
      </Sequence>
      <Sequence from={sec(8)} durationInFrames={sec(10)}>
        <ScenePains />
      </Sequence>
      <Sequence from={sec(18)} durationInFrames={sec(12)}>
        <SceneChannels />
      </Sequence>
      <Sequence from={sec(30)} durationInFrames={sec(12)}>
        <SceneConsole />
      </Sequence>
      <Sequence from={sec(42)} durationInFrames={sec(13)}>
        <SceneAgent />
      </Sequence>
      <Sequence from={sec(55)} durationInFrames={sec(13)}>
        <SceneRag />
      </Sequence>
      <Sequence from={sec(68)} durationInFrames={sec(12)}>
        <SceneMemory />
      </Sequence>
      <Sequence from={sec(80)} durationInFrames={sec(14)}>
        <SceneWorkflow />
      </Sequence>
      <Sequence from={sec(94)} durationInFrames={sec(12)}>
        <SceneWorkflowDemo />
      </Sequence>
      <Sequence from={sec(106)} durationInFrames={sec(9)}>
        <SceneBusiness />
      </Sequence>
      <Sequence from={sec(115)} durationInFrames={sec(5)}>
        <SceneOutro />
      </Sequence>
    </AbsoluteFill>
  );
};
