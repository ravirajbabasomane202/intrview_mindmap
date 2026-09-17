/** Mini visual previews of diagram/marker templates for the picker menu.
 *  Shows the actual structure (nodes + links) rather than text names so the
 *  user can recognize what will be inserted at a glance.
 */
export function TemplatePreviewSwatch({ kind }: { kind: string }) {
  const accent = 'hsl(var(--primary))';
  const soft = 'hsl(var(--primary) / .22)';
  const muted = 'hsl(var(--muted-foreground) / .35)';

  const Node = ({ x, y, w, h, r = 2, fill = soft }: { x: number; y: number; w: number; h: number; r?: number; fill?: string }) => (
    <rect x={x} y={y} width={w} height={h} rx={r} fill={fill} stroke={accent} strokeWidth={1.2} />
  );
  const Ellipse = ({ cx, cy, rx, ry, fill = soft }: { cx: number; cy: number; rx: number; ry: number; fill?: string }) => (
    <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={fill} stroke={accent} strokeWidth={1.2} />
  );
  const Line = ({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) => (
    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={accent} strokeWidth={1.2} opacity={0.7} />
  );

  switch (kind) {
    case 'flowchart':
      return (
        <svg viewBox="0 0 48 48" className="h-full w-full">
          <Node x={14} y={2} w={20} h={8} r={4} />
          <Line x1={24} y1={10} x2={24} y2={14} />
          <Node x={12} y={14} w={24} h={8} />
          <Line x1={24} y1={22} x2={24} y2={26} />
          <polygon points="24,26 36,34 24,42 12,34" fill={soft} stroke={accent} strokeWidth={1.2} />
          <Line x1={24} y1={42} x2={24} y2={46} />
          <Node x={14} y={40} w={20} h={6} r={3} />
        </svg>
      );
    case 'process-diagram':
      return (
        <svg viewBox="0 0 48 48" className="h-full w-full">
          <Node x={2} y={18} w={10} h={12} />
          <Line x1={12} y1={24} x2={16} y2={24} />
          <Node x={16} y={18} w={10} h={12} />
          <Line x1={26} y1={24} x2={30} y2={24} />
          <Node x={30} y={18} w={10} h={12} />
          <Line x1={40} y1={24} x2={44} y2={24} />
          <Node x={38} y={18} w={8} h={12} />
        </svg>
      );
    case 'org-chart':
    case 'tree-diagram':
      return (
        <svg viewBox="0 0 48 48" className="h-full w-full">
          <Node x={16} y={4} w={16} h={8} r={2} />
          <Line x1={24} y1={12} x2={24} y2={18} />
          <Line x1={10} y1={18} x2={38} y2={18} />
          <Line x1={10} y1={18} x2={10} y2={22} />
          <Line x1={24} y1={18} x2={24} y2={22} />
          <Line x1={38} y1={18} x2={38} y2={22} />
          <Node x={4} y={22} w={12} h={8} />
          <Node x={18} y={22} w={12} h={8} />
          <Node x={32} y={22} w={12} h={8} />
          <Line x1={10} y1={30} x2={10} y2={34} />
          <Node x={4} y={34} w={12} h={8} />
        </svg>
      );
    case 'timeline':
      return (
        <svg viewBox="0 0 48 48" className="h-full w-full">
          <Line x1={4} y1={24} x2={44} y2={24} />
          {[8, 20, 32, 42].map((x) => (
            <g key={x}>
              <circle cx={x} cy={24} r={3.5} fill={soft} stroke={accent} strokeWidth={1.2} />
              <Node x={x - 5} y={10} w={10} h={6} r={2} />
            </g>
          ))}
        </svg>
      );
    case 'cycle-diagram':
      return (
        <svg viewBox="0 0 48 48" className="h-full w-full">
          <Ellipse cx={24} cy={12} rx={8} ry={5} />
          <Ellipse cx={36} cy={24} rx={8} ry={5} />
          <Ellipse cx={24} cy={36} rx={8} ry={5} />
          <Ellipse cx={12} cy={24} rx={8} ry={5} />
          <Line x1={28} y1={15} x2={32} y2={20} />
          <Line x1={32} y1={28} x2={28} y2={33} />
          <Line x1={20} y1={33} x2={16} y2={28} />
          <Line x1={16} y1={20} x2={20} y2={15} />
        </svg>
      );
    case 'venn-diagram':
      return (
        <svg viewBox="0 0 48 48" className="h-full w-full">
          <ellipse cx={18} cy={24} rx={14} ry={14} fill="hsl(var(--primary) / .25)" stroke={accent} strokeWidth={1.2} />
          <ellipse cx={30} cy={24} rx={14} ry={14} fill="hsl(var(--primary) / .18)" stroke={accent} strokeWidth={1.2} />
        </svg>
      );
    case 'funnel':
      return (
        <svg viewBox="0 0 48 48" className="h-full w-full">
          <polygon points="4,4 44,4 38,14 10,14" fill={soft} stroke={accent} strokeWidth={1.2} />
          <polygon points="10,16 38,16 34,26 14,26" fill={soft} stroke={accent} strokeWidth={1.2} />
          <polygon points="14,28 34,28 30,38 18,38" fill={soft} stroke={accent} strokeWidth={1.2} />
          <polygon points="18,40 30,40 26,46 22,46" fill={soft} stroke={accent} strokeWidth={1.2} />
        </svg>
      );
    case 'pyramid':
      return (
        <svg viewBox="0 0 48 48" className="h-full w-full">
          <polygon points="24,4 32,16 16,16" fill={soft} stroke={accent} strokeWidth={1.2} />
          <polygon points="14,18 34,18 38,30 10,30" fill={soft} stroke={accent} strokeWidth={1.2} />
          <polygon points="8,32 40,32 44,44 4,44" fill={soft} stroke={accent} strokeWidth={1.2} />
        </svg>
      );
    case 'sequence-diagram':
      return (
        <svg viewBox="0 0 48 48" className="h-full w-full">
          <Node x={4} y={2} w={10} h={6} r={1} />
          <Node x={19} y={2} w={10} h={6} r={1} />
          <Node x={34} y={2} w={10} h={6} r={1} />
          <Line x1={9} y1={8} x2={9} y2={44} />
          <Line x1={24} y1={8} x2={24} y2={44} />
          <Line x1={39} y1={8} x2={39} y2={44} />
          <Line x1={9} y1={16} x2={24} y2={16} />
          <Line x1={24} y1={26} x2={39} y2={26} />
          <Line x1={9} y1={36} x2={39} y2={36} />
        </svg>
      );
    case 'kanban-board':
      return (
        <svg viewBox="0 0 48 48" className="h-full w-full">
          <rect x={2} y={2} width={14} height={44} rx={2} fill="none" stroke={accent} strokeWidth={1.2} strokeDasharray="2 1.5" />
          <rect x={17} y={2} width={14} height={44} rx={2} fill="none" stroke={accent} strokeWidth={1.2} strokeDasharray="2 1.5" />
          <rect x={32} y={2} width={14} height={44} rx={2} fill="none" stroke={accent} strokeWidth={1.2} strokeDasharray="2 1.5" />
          <Node x={4} y={8} w={10} h={8} r={1.5} />
          <Node x={4} y={20} w={10} h={8} r={1.5} />
          <Node x={19} y={8} w={10} h={8} r={1.5} />
          <Node x={34} y={8} w={10} h={8} r={1.5} />
        </svg>
      );
    case 'timeline-cards':
      return (
        <svg viewBox="0 0 48 48" className="h-full w-full">
          <Node x={2} y={14} w={12} h={16} r={2} />
          <Node x={16} y={14} w={12} h={16} r={2} />
          <Node x={30} y={14} w={12} h={16} r={2} />
          <rect x={2} y={14} width={12} height={4} fill={accent} opacity={0.5} />
          <rect x={16} y={14} width={12} height={4} fill={accent} opacity={0.5} />
          <rect x={30} y={14} width={12} height={4} fill={accent} opacity={0.5} />
        </svg>
      );
    case 'number-marker':
      return (
        <svg viewBox="0 0 48 48" className="h-full w-full">
          <circle cx={24} cy={24} r={14} fill={accent} />
          <text x={24} y={28} textAnchor="middle" fill="#fff" fontSize="16" fontWeight="700" fontFamily="system-ui">1</text>
        </svg>
      );
    case 'letter-marker':
      return (
        <svg viewBox="0 0 48 48" className="h-full w-full">
          <circle cx={24} cy={24} r={14} fill={accent} />
          <text x={24} y={28} textAnchor="middle" fill="#fff" fontSize="16" fontWeight="700" fontFamily="system-ui">A</text>
        </svg>
      );
    case 'comment-bubble':
      return (
        <svg viewBox="0 0 48 48" className="h-full w-full">
          <path d="M6 8h36v24H20l-8 10v-10H6V8z" fill={soft} stroke={accent} strokeWidth={1.2} />
          <line x1={12} y1={16} x2={30} y2={16} stroke={muted} strokeWidth={1.5} />
          <line x1={12} y1={22} x2={26} y2={22} stroke={muted} strokeWidth={1.5} />
        </svg>
      );
    case 'circle-highlight':
      return (
        <svg viewBox="0 0 48 48" className="h-full w-full">
          <ellipse cx={24} cy={24} rx={18} ry={14} fill="rgba(253,224,71,.45)" stroke="rgba(234,179,8,.8)" strokeWidth={1.5} />
        </svg>
      );
    case 'rectangle-highlight':
      return (
        <svg viewBox="0 0 48 48" className="h-full w-full">
          <rect x={6} y={10} width={36} height={28} rx={2} fill="rgba(253,224,71,.45)" stroke="rgba(234,179,8,.8)" strokeWidth={1.5} />
        </svg>
      );
    case 'dimension-line':
      return (
        <svg viewBox="0 0 48 48" className="h-full w-full">
          <line x1={6} y1={24} x2={42} y2={24} stroke={accent} strokeWidth={1.5} />
          <polyline points="10,20 6,24 10,28" fill="none" stroke={accent} strokeWidth={1.5} />
          <polyline points="38,20 42,24 38,28" fill="none" stroke={accent} strokeWidth={1.5} />
          <text x={24} y={18} textAnchor="middle" fill={accent} fontSize="8" fontFamily="system-ui">12</text>
        </svg>
      );
    case 'underline':
      return (
        <svg viewBox="0 0 48 48" className="h-full w-full">
          <line x1={8} y1={30} x2={40} y2={30} stroke={accent} strokeWidth={2.5} strokeLinecap="round" />
          <rect x={10} y={14} width={28} height={8} rx={1} fill={muted} />
        </svg>
      );
    default:
      return <div className="h-full w-full rounded bg-[hsl(var(--primary)/.2)]" />;
  }
}
