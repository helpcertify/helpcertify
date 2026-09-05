/* eslint-disable react-refresh/only-export-components -- this is a
   component *registry* module (VISUAL_COMPONENTS / COMPONENT_LABELS), not
   a single-component file; fast-refresh granularity does not apply. */
import type { FC } from 'react';
import type { VisualComponentId } from '../storyboard';

// Reusable schematic SVG components for visual lessons. Deliberately plain
// and diagrammatic - the point is technical clarity, not decoration. Each
// takes a centre point plus an optional label and highlight state, and
// draws inside a nominal 64x64 box. These same components are what a later
// Remotion composition would render frame by frame.

export interface PrimitiveProps {
  x: number;
  y: number;
  label?: string;
  highlighted?: boolean;
  opacity?: number;
}

const STROKE = 'currentColor';

function Frame({
  x,
  y,
  label,
  highlighted,
  opacity = 1,
  children,
}: PrimitiveProps & { children: React.ReactNode }) {
  return (
    <g transform={`translate(${x} ${y})`} opacity={opacity} style={{ transition: 'opacity 240ms ease' }}>
      {highlighted && <circle r={44} fill="#155EEF" opacity={0.12} />}
      <g
        stroke={highlighted ? '#155EEF' : STROKE}
        strokeWidth={highlighted ? 2.5 : 1.8}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </g>
      {label && (
        <text y={46} textAnchor="middle" fontSize={11} fill={STROKE} stroke="none">
          {label.length > 22 ? `${label.slice(0, 21)}…` : label}
        </text>
      )}
    </g>
  );
}

const Laptop: FC<PrimitiveProps> = (p) => (
  <Frame {...p}>
    <rect x={-22} y={-18} width={44} height={28} rx={2} />
    <path d="M-30 14 L30 14 L24 10 L-24 10 Z" />
  </Frame>
);

const Browser: FC<PrimitiveProps> = (p) => (
  <Frame {...p}>
    <rect x={-24} y={-18} width={48} height={34} rx={3} />
    <path d="M-24 -8 L24 -8" />
    <circle cx={-18} cy={-13} r={1.6} />
    <circle cx={-12} cy={-13} r={1.6} />
  </Frame>
);

const Server: FC<PrimitiveProps> = (p) => (
  <Frame {...p}>
    <rect x={-16} y={-22} width={32} height={44} rx={2} />
    <path d="M-16 -8 L16 -8 M-16 6 L16 6" />
    <circle cx={-9} cy={-15} r={1.6} />
    <circle cx={-9} cy={-1} r={1.6} />
  </Frame>
);

const Database: FC<PrimitiveProps> = (p) => (
  <Frame {...p}>
    <ellipse cx={0} cy={-14} rx={18} ry={7} />
    <path d="M-18 -14 L-18 14 A18 7 0 0 0 18 14 L18 -14" />
    <path d="M-18 0 A18 7 0 0 0 18 0" />
  </Frame>
);

const DnsServer: FC<PrimitiveProps> = (p) => (
  <Frame {...p}>
    <rect x={-18} y={-20} width={36} height={40} rx={2} />
    <text y={4} textAnchor="middle" fontSize={11} stroke="none" fill={p.highlighted ? '#155EEF' : 'currentColor'}>
      DNS
    </text>
  </Frame>
);

const Router: FC<PrimitiveProps> = (p) => (
  <Frame {...p}>
    <rect x={-24} y={-8} width={48} height={18} rx={4} />
    <path d="M-14 -8 L-6 -20 M0 -8 L0 -22 M14 -8 L22 -20" />
  </Frame>
);

const Switch: FC<PrimitiveProps> = (p) => (
  <Frame {...p}>
    <rect x={-26} y={-10} width={52} height={20} rx={3} />
    <path d="M-18 10 L-18 18 M-6 10 L-6 18 M6 10 L6 18 M18 10 L18 18" />
  </Frame>
);

const Firewall: FC<PrimitiveProps> = (p) => (
  <Frame {...p}>
    <rect x={-22} y={-18} width={44} height={36} rx={2} />
    <path d="M-22 -6 L22 -6 M-22 6 L22 6 M-8 -18 L-8 -6 M8 -6 L8 6 M-8 6 L-8 18 M0 -18 L0 -6 M0 6 L0 18" />
  </Frame>
);

const Cloud: FC<PrimitiveProps> = (p) => (
  <Frame {...p}>
    <path d="M-20 10 A10 10 0 0 1 -18 -8 A14 14 0 0 1 8 -12 A10 10 0 0 1 20 10 Z" />
  </Frame>
);

const Certificate: FC<PrimitiveProps> = (p) => (
  <Frame {...p}>
    <rect x={-20} y={-16} width={40} height={28} rx={2} />
    <circle cx={0} cy={16} r={6} />
    <path d="M-14 -8 L14 -8 M-14 0 L6 0" />
  </Frame>
);

const User: FC<PrimitiveProps> = (p) => (
  <Frame {...p}>
    <circle cx={0} cy={-10} r={9} />
    <path d="M-16 18 A16 14 0 0 1 16 18" />
  </Frame>
);

const Api: FC<PrimitiveProps> = (p) => (
  <Frame {...p}>
    <rect x={-22} y={-14} width={44} height={28} rx={4} />
    <text y={4} textAnchor="middle" fontSize={10} stroke="none" fill={p.highlighted ? '#155EEF' : 'currentColor'}>
      API
    </text>
  </Frame>
);

function Packet({ p, glyph }: { p: PrimitiveProps; glyph: string }) {
  return (
    <Frame {...p}>
      <path d="M-16 -8 L16 -8 L16 8 L-16 8 Z" />
      <text y={4} textAnchor="middle" fontSize={12} stroke="none" fill={p.highlighted ? '#155EEF' : 'currentColor'}>
        {glyph}
      </text>
    </Frame>
  );
}
const RequestPacket: FC<PrimitiveProps> = (p) => <Packet p={p} glyph="→" />;
const ResponsePacket: FC<PrimitiveProps> = (p) => <Packet p={p} glyph="←" />;
const DataPacket: FC<PrimitiveProps> = (p) => <Packet p={p} glyph="•••" />;

const EncryptionIndicator: FC<PrimitiveProps> = (p) => (
  <Frame {...p}>
    <rect x={-12} y={-4} width={24} height={20} rx={3} />
    <path d="M-7 -4 L-7 -12 A7 7 0 0 1 7 -12 L7 -4" />
  </Frame>
);

export const VISUAL_COMPONENTS: Record<VisualComponentId, FC<PrimitiveProps>> = {
  laptop: Laptop,
  browser: Browser,
  server: Server,
  database: Database,
  dnsServer: DnsServer,
  router: Router,
  switch: Switch,
  firewall: Firewall,
  cloud: Cloud,
  certificate: Certificate,
  user: User,
  api: Api,
  requestPacket: RequestPacket,
  responsePacket: ResponsePacket,
  dataPacket: DataPacket,
  encryptionIndicator: EncryptionIndicator,
};

export const COMPONENT_LABELS: Record<VisualComponentId, string> = {
  laptop: 'Device',
  browser: 'Browser',
  server: 'Server',
  database: 'Database',
  dnsServer: 'DNS server',
  router: 'Router',
  switch: 'Switch',
  firewall: 'Firewall',
  cloud: 'Internet',
  certificate: 'Certificate',
  user: 'User',
  api: 'API',
  requestPacket: 'Request',
  responsePacket: 'Response',
  dataPacket: 'Data',
  encryptionIndicator: 'Encrypted',
};
