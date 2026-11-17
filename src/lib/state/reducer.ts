import type {
  AppNotification,
  LogLine,
  ScanRun,
  Source,
  WebhookEvent,
} from '../domain/types';

export type BackendHealth = 'unknown' | 'up' | 'down';

export interface Connection {
  smeeConnected: boolean | null;
  smeeMessage?: string;
  streamA: boolean;
  streamB: boolean;
  backendA: BackendHealth;
  backendB: BackendHealth;
}

export interface State {
  scans: ScanRun[];
  aliases: Record<string, string>;
  events: WebhookEvent[];
  logs: LogLine[];
  notifications: AppNotification[];
  unread: number;
  conn: Connection;
  smeeUrl?: string;
  banner?: { message: string; href?: string };
  loaded: boolean;
  errors: Partial<Record<Source, string>>;
  lastSync?: string;
}

export const initialState: State = {
  scans: [],
  aliases: {},
  events: [],
  logs: [],
  notifications: [],
  unread: 0,
  conn: { smeeConnected: null, streamA: false, streamB: false, backendA: 'unknown', backendB: 'unknown' },
  loaded: false,
  errors: {},
};

export type Action =
  | { type: 'scans'; source: Source; scans: ScanRun[]; events?: WebhookEvent[] }
  | { type: 'scanAdded'; scan: ScanRun; event?: WebhookEvent }
  | { type: 'eventAdded'; event: WebhookEvent }
  | { type: 'logs'; source: Source; logs: LogLine[] }
  | { type: 'logAdded'; line: LogLine }
  | { type: 'clearLogs' }
  | { type: 'conn'; patch: Partial<Connection> }
  | { type: 'smeeUrl'; url: string }
  | { type: 'notify'; item: AppNotification }
  | { type: 'banner'; banner?: { message: string; href?: string } }
  | { type: 'markRead' }
  | { type: 'clearNotifications' }
  | { type: 'error'; source: Source; message?: string }
  | { type: 'loaded' };

const scanKey = (s: ScanRun) =>
  `${s.source}|${s.repo ?? ''}|${s.trigger}|${s.commitSha ?? s.scannedAt}`;
const eventKey = (e: WebhookEvent) => `${e.repo}|${e.event}|${(e.sha ?? '').slice(0, 7) || e.timestamp}`;

/** Merge scans by id or by logical key. Incoming wins; replaced ids are recorded as aliases. */
export function mergeScans(
  existing: ScanRun[],
  incoming: ScanRun[],
  aliases: Record<string, string>,
): { scans: ScanRun[]; aliases: Record<string, string> } {
  const out = [...existing];
  const nextAliases = { ...aliases };
  for (const s of incoming) {
    const i = out.findIndex((e) => e.id === s.id || scanKey(e) === scanKey(s));
    if (i >= 0) {
      if (out[i].id !== s.id) nextAliases[out[i].id] = s.id;
      out[i] = s;
    } else out.push(s);
  }
  out.sort((a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime());
  return { scans: out.slice(0, 200), aliases: nextAliases };
}

/** Events are de-duplicated on repo + event + short sha; backend B (richer) wins ties. */
export function mergeEvents(existing: WebhookEvent[], incoming: WebhookEvent[]): WebhookEvent[] {
  const map = new Map<string, WebhookEvent>();
  for (const e of [...existing, ...incoming]) {
    const k = e.sha || e.event === 'ping' ? eventKey(e) : e.id;
    const prev = map.get(k);
    if (!prev || (e.source === 'securedevops' && prev.source !== 'securedevops') || (e.source === prev.source && e.id !== prev.id)) {
      map.set(k, e);
    }
  }
  return Array.from(map.values())
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 200);
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'scans': {
      const m = mergeScans(state.scans, action.scans, state.aliases);
      return {
        ...state,
        scans: m.scans,
        aliases: m.aliases,
        events: action.events ? mergeEvents(state.events, action.events) : state.events,
        errors: { ...state.errors, [action.source]: undefined },
        lastSync: new Date().toISOString(),
      };
    }
    case 'scanAdded': {
      const m = mergeScans(state.scans, [action.scan], state.aliases);
      return {
        ...state,
        scans: m.scans,
        aliases: m.aliases,
        events: action.event ? mergeEvents(state.events, [action.event]) : state.events,
      };
    }
    case 'eventAdded':
      return { ...state, events: mergeEvents(state.events, [action.event]) };
    case 'logs': {
      const others = state.logs.filter((l) => l.source !== action.source);
      return { ...state, logs: [...others, ...action.logs].sort((a, b) => a.timestamp.localeCompare(b.timestamp)).slice(-500) };
    }
    case 'logAdded':
      return { ...state, logs: [...state.logs, action.line].slice(-500) };
    case 'clearLogs':
      return { ...state, logs: [] };
    case 'conn':
      return { ...state, conn: { ...state.conn, ...action.patch } };
    case 'smeeUrl':
      return { ...state, smeeUrl: action.url };
    case 'notify':
      return { ...state, notifications: [action.item, ...state.notifications].slice(0, 50), unread: state.unread + 1 };
    case 'banner':
      return { ...state, banner: action.banner };
    case 'markRead':
      return { ...state, unread: 0 };
    case 'clearNotifications':
      return { ...state, notifications: [], unread: 0 };
    case 'error':
      return { ...state, errors: { ...state.errors, [action.source]: action.message } };
    case 'loaded':
      return { ...state, loaded: true };
    default:
      return state;
  }
}
