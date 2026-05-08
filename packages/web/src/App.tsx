import { useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, MapContainer, Polygon, Polyline, TileLayer, useMapEvents } from "react-leaflet";
import {
  AlertCircle, Bot, Calendar, CalendarCheck,
  Check, CheckCircle2, ChevronDown, Copy, FileText, Map, Settings2,
  Plus, Rocket, TestTube2, Trash2, Wrench, X, XCircle, Zap
} from "lucide-react";
import {
  createConfig, deleteConfig, fetchConfigs, fetchEvents, previewRoute, updateConfig
} from "./api/client";
import type { AreaMode, CalendarRoute, ClientConfig, EventLog, GhlFieldMappings, StageMapping } from "./types";
import "./styles.css";

// ─── Constants ────────────────────────────────────────────────────────────────

const industryOptions = [
  "HVAC", "Plumbing", "Electrical", "Garage Doors", "Solar",
  "Roofing", "Landscaping", "Painting", "Fencing", "Windows", "Remodeling", "Other"
];
const crmOptions = ["ServiceTitan", "JobNimbus", "Housecall Pro", "FieldPulse", "Custom"];
const pluginDefaults = [
  "New Lead", "Appt Requested", "Appt Booked", "Welcome Funnel",
  "Callback Requested", "Estimate Sent", "Disposition", "Review", "Annual Lead", "Annual Customer"
];
const ghlFieldMappingFields = [
  ["leadSource",       "Lead Source",        "contact.lead_source"],
  ["serviceRequest",   "Service Request",    "contact.service_request"],
  ["serviceRequested", "Service Requested",  "contact.service_requested"],
  ["serviceAreaZip",   "Service Area / ZIP", "contact.service_area__zip"],
  ["locationBranch",   "Location / Branch",  "contact.location__branch"],
  ["assignedRep",      "Assigned Rep",       "contact.assigned_rep"],
  ["estimateStatus",   "Estimate Status",    "contact.estimate_status"],
  ["declineReason",    "Decline Reason",     "contact.decline_reason"],
  ["lastJobType",      "Last Job Type",      "contact.last_job_type"],
  ["routedCalendarId", "Routed Calendar ID", ""],
  ["callDirection",    "Call Direction",     ""],
  ["callTranscript",   "Call Transcript",    ""],
  ["externalLeadId",   "External Lead ID",   ""]
] as const satisfies ReadonlyArray<readonly [keyof GhlFieldMappings, string, string]>;

const botModeKeys = ["Appt Requested", "Appt Confirmed", "Estimate Requested"] as const;
type BotMode = (typeof botModeKeys)[number];
type JobTypeSource = "crm" | "manual";
type TabId = "bot" | "services" | "calendars" | "integrations" | "test";

const NAV_ITEMS: { id: TabId; label: string; Icon: React.ElementType }[] = [
  { id: "bot",          label: "Bot Setup",      Icon: Bot },
  { id: "services",     label: "Services",        Icon: Wrench },
  { id: "calendars",    label: "Calendars",       Icon: Calendar },
  { id: "integrations", label: "Integrations",    Icon: Settings2 },
  { id: "test",         label: "Test & Publish",  Icon: Rocket },
];

const jobTypeLibrary = [
  "AC Repair", "AC Install / Replacement", "AC Tune-up", "Furnace Repair",
  "Furnace Install / Replacement", "Heat Pump Install", "Heat Pump Repair",
  "Ductless Mini-Split", "Duct Cleaning", "Smart Thermostat", "HVAC Inspection",
  "Maintenance Plan", "Leak / Pipe Repair", "Water Heater Repair", "Water Heater Install",
  "Tankless Water Heater", "Drain Cleaning", "Sewer Line Repair",
  "Fixture Install (Faucet/Toilet)", "Whole-home Plumbing Inspection",
  "Panel Upgrade", "Wiring / Outlet Repair"
];

// ─── Leaflet polygon map ──────────────────────────────────────────────────────

interface MapPoint { lat: number; lng: number }
interface PolygonMapModalProps {
  title: string; initialPoints: MapPoint[];
  onUseArea: (p: MapPoint[]) => void; onClose: () => void;
}
function PolygonMapClickCapture({ onAdd }: { onAdd: (p: MapPoint) => void }) {
  useMapEvents({ click(e) { onAdd({ lat: e.latlng.lat, lng: e.latlng.lng }); } });
  return null;
}
function PolygonMapModal({ title, initialPoints, onUseArea, onClose }: PolygonMapModalProps) {
  const [pts, setPts] = useState<MapPoint[]>(initialPoints);
  const center: [number, number] = pts.length > 0 ? [pts[0].lat, pts[0].lng] : [34.052, -118.243];
  const lPts = pts.map((p) => [p.lat, p.lng] as [number, number]);
  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-5xl flex flex-col bg-navy-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden" style={{ maxHeight: "90vh" }}>
        <header className="flex items-start justify-between gap-4 px-5 py-4 border-b border-white/[0.07] flex-shrink-0">
          <div>
            <h3 className="text-[15px] font-semibold text-white">{title}</h3>
            <p className="text-[12px] text-slate-500 mt-0.5">Click the map to add polygon points. Minimum 3 required.</p>
          </div>
          <button type="button" onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-white ring-1 ring-inset ring-white/[0.08] rounded-xl hover:bg-white/[0.06] transition-all flex-shrink-0">
            <X size={14} />
          </button>
        </header>
        <div className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.07] bg-navy-800/40 flex-shrink-0">
          <button type="button" onClick={() => setPts((c) => c.slice(0, -1))}
            className="px-3 py-1.5 text-[12px] text-slate-400 ring-1 ring-inset ring-white/[0.08] rounded-xl hover:bg-white/[0.06] hover:text-white transition-all">
            Delete last
          </button>
          <button type="button" onClick={() => setPts([])}
            className="px-3 py-1.5 text-[12px] text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/[0.06] transition-colors">
            Clear all
          </button>
          <span className="text-[12px] text-slate-500 ml-auto">
            <span className={`font-semibold ${pts.length >= 3 ? "text-green-400" : "text-slate-400"}`}>{pts.length}</span> points
          </span>
          <button type="button" disabled={pts.length < 3} onClick={() => onUseArea(pts)}
            className="px-4 py-1.5 text-[12px] font-semibold bg-gold text-navy-950 rounded-lg hover:bg-gold-light disabled:opacity-40 transition-colors">
            Use Area
          </button>
        </div>
        <div className="flex-1 overflow-hidden" style={{ minHeight: "360px" }}>
          <MapContainer center={center} zoom={13} scrollWheelZoom className="leaflet-map">
            <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <PolygonMapClickCapture onAdd={(p) => setPts((c) => [...c, p])} />
            {lPts.length >= 2 && <Polyline positions={lPts} pathOptions={{ color: "#D4A017", weight: 3 }} />}
            {lPts.length >= 3 && <Polygon positions={lPts} pathOptions={{ color: "#D4A017", fillColor: "#D4A017", fillOpacity: 0.2 }} />}
            {lPts.map((p, i) => <CircleMarker key={i} center={p} radius={6} pathOptions={{ color: "#fff" }} />)}
          </MapContainer>
        </div>
      </div>
    </div>
  );
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function createEmptyRoute(services: string[]): CalendarRoute {
  const first = services[0] ?? "General Service";
  return { id: crypto.randomUUID(), label: first, ghlCalendarId: "", services: [first], area: { mode: "NONE", zipCodes: [], polygonPoints: [] } };
}
function cloneConfigForSave(c: ClientConfig): Omit<ClientConfig, "id" | "createdAt" | "updatedAt"> {
  const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = c;
  void _i; void _c; void _u; return rest;
}
function parseZipCodes(v: string) { return v.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean); }
function parsePolygonPoints(v: string) {
  return v.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const [a, b] = l.split(",").map((s) => s.trim());
    return { lat: Number(a), lng: Number(b) };
  }).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}
function pointsToText(pts: { lat: number; lng: number }[]) { return pts.map((p) => `${p.lat},${p.lng}`).join("\n"); }
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Design-system primitives ─────────────────────────────────────────────────

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-[#0D1524] ring-1 ring-inset ring-white/[0.06] rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.3)] ${className}`}>
      {children}
    </div>
  );
}
function CardHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-white/[0.05]">
      <div>
        <h3 className="text-[13px] font-semibold text-white tracking-[-0.01em]">{title}</h3>
        {description && <p className="text-[12px] text-slate-500 mt-0.5 leading-relaxed">{description}</p>}
      </div>
      {action && <div className="ml-4 flex-shrink-0">{action}</div>}
    </div>
  );
}
function CardBody({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`px-6 py-5 ${className}`}>{children}</div>;
}
function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.08em]">{children}</span>
      {required && <span className="text-[9px] px-1.5 py-px rounded bg-amber-500/15 text-amber-400/90 font-semibold tracking-wide">REQ</span>}
    </div>
  );
}
function Input({ value, onChange, placeholder = "", mono = false, type = "text" }: {
  value: string | number; onChange: (v: string) => void;
  placeholder?: string; mono?: boolean; type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full bg-black/20 ring-1 ring-inset ring-white/[0.08] rounded-xl px-3.5 py-2.5 text-[13px] text-white placeholder-slate-700
        focus:ring-gold/40 focus:bg-black/30 focus:outline-none hover:ring-white/[0.12] transition-all duration-150
        ${mono ? "font-mono text-[12px] text-slate-300 tracking-tight" : ""}`}
    />
  );
}
function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} role="switch" aria-checked={on}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full ring-1 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-gold/30 ${
        on ? "bg-gold ring-gold/60 shadow-[0_0_10px_rgba(212,160,23,0.35)]" : "bg-white/[0.08] ring-white/[0.12] hover:bg-white/[0.12]"
      }`}>
      <span className={`mt-[3px] ml-[3px] inline-block h-[18px] w-[18px] transform rounded-full shadow-sm transition-all duration-200 ${
        on ? "translate-x-5 bg-navy-950" : "translate-x-0 bg-white/70"
      }`} />
    </button>
  );
}
function Pill({ label, active, onClick, disabled = false }: { label: string; active: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all duration-150 disabled:opacity-40 ${
        active
          ? "bg-gold text-navy-950 font-semibold shadow-[0_0_12px_rgba(212,160,23,0.3)]"
          : "bg-white/[0.04] ring-1 ring-inset ring-white/[0.08] text-slate-400 hover:ring-white/[0.14] hover:text-white hover:bg-white/[0.07]"
      }`}>
      {label}
    </button>
  );
}
function Tag({ label, onRemove, disabled = false }: { label: string; onRemove: () => void; disabled?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 bg-white/[0.04] ring-1 ring-inset ring-white/[0.08] rounded-full text-[12px] text-slate-300">
      {label}
      <button type="button" onClick={onRemove} disabled={disabled}
        className="w-4 h-4 rounded-full flex items-center justify-center text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition-all disabled:opacity-30 flex-shrink-0">
        <X size={11} />
      </button>
    </span>
  );
}
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    processed: "bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20",
    duplicate: "bg-slate-500/10 text-slate-400 ring-1 ring-inset ring-slate-500/20",
    rejected:  "bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/20",
    failed:    "bg-red-500/10 text-red-400 ring-1 ring-inset ring-red-500/20",
  };
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide ${map[status] ?? "bg-white/[0.06] text-slate-400"}`}>{status}</span>;
}
function TypeBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    lead:     "bg-blue-500/10 text-blue-400 ring-1 ring-inset ring-blue-500/20",
    status:   "bg-violet-500/10 text-violet-400 ring-1 ring-inset ring-violet-500/20",
    estimate: "bg-orange-500/10 text-orange-400 ring-1 ring-inset ring-orange-500/20",
    job:      "bg-teal-500/10 text-teal-400 ring-1 ring-inset ring-teal-500/20",
    retell:   "bg-pink-500/10 text-pink-400 ring-1 ring-inset ring-pink-500/20",
  };
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide ${map[type] ?? "bg-white/[0.06] text-slate-400"}`}>{type}</span>;
}
function AddInput({ placeholder, onAdd }: { placeholder: string; onAdd: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex gap-2 mt-4">
      <input ref={ref} placeholder={placeholder}
        onKeyDown={(e) => { if (e.key !== "Enter") return; e.preventDefault(); const v = e.currentTarget.value.trim(); if (!v) return; onAdd(v); e.currentTarget.value = ""; }}
        className="flex-1 bg-black/20 ring-1 ring-inset ring-white/[0.08] rounded-xl px-3.5 py-2.5 text-[13px] text-white placeholder-slate-700 focus:ring-gold/40 focus:outline-none hover:ring-white/[0.12] transition-all" />
      <button type="button" onClick={() => { const v = ref.current?.value.trim() ?? ""; if (!v) return; onAdd(v); if (ref.current) ref.current.value = ""; }}
        className="w-11 bg-white/[0.04] ring-1 ring-inset ring-white/[0.08] rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.08] transition-all flex items-center justify-center flex-shrink-0">
        <Plus size={14} />
      </button>
    </div>
  );
}
function Toast({ message, type, onDismiss }: { message: string; type: "success" | "error" | "info"; onDismiss: () => void }) {
  const styles = {
    success: "bg-emerald-950/90 ring-1 ring-emerald-500/25 text-emerald-300",
    error:   "bg-red-950/90 ring-1 ring-red-500/25 text-red-300",
    info:    "bg-[#0D1524]/90 ring-1 ring-white/10 text-slate-300",
  };
  const icons = { success: <CheckCircle2 size={14} />, error: <XCircle size={14} />, info: <AlertCircle size={14} /> };
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3.5 rounded-2xl backdrop-blur-xl text-[13px] font-medium shadow-2xl max-w-xs ${styles[type]}`}>
      <span className="flex-shrink-0">{icons[type]}</span>
      <span className="flex-1 leading-snug">{message}</span>
      <button type="button" onClick={onDismiss} className="flex-shrink-0 opacity-40 hover:opacity-90 transition-opacity p-0.5 rounded-full hover:bg-white/10">
        <X size={12} />
      </button>
    </div>
  );
}
function Accordion({ title, subtitle, open, onToggle, children }: {
  title: string; subtitle?: string; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="ring-1 ring-inset ring-white/[0.06] rounded-2xl overflow-hidden">
      <button type="button" onClick={onToggle} className="w-full flex items-center justify-between px-5 py-4 bg-white/[0.02] hover:bg-white/[0.04] transition-colors text-left">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-[13px] font-medium text-white">{title}</span>
          {subtitle && <span className="text-[10px] text-slate-600 bg-white/[0.05] px-2 py-px rounded-full flex-shrink-0">{subtitle}</span>}
        </div>
        <ChevronDown size={13} className={`text-slate-600 transition-transform duration-200 flex-shrink-0 ml-3 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-5 py-4 border-t border-white/[0.05]">{children}</div>}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  // ── State ──
  const [configs, setConfigs] = useState<ClientConfig[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<ClientConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [events, setEvents] = useState<EventLog[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>("bot");
  const [accordionOpen, setAccordionOpen] = useState<Record<string, boolean>>({ leadRouting: true, assignment: false, retell: false });
  const [routeInput, setRouteInput] = useState({ service: "", zip: "", lat: "", lng: "", stage: "New Lead" });
  const [routeResult, setRouteResult] = useState<{ matched: boolean; calendar: string; reason: string; pluginEnabled: boolean } | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [jobTypeSource, setJobTypeSource] = useState<JobTypeSource>("manual");
  const [jobTypeQuery, setJobTypeQuery] = useState("");
  const [isJobTypeModalOpen, setIsJobTypeModalOpen] = useState(false);
  const [jobTypeSelected, setJobTypeSelected] = useState<string[]>([]);
  const [polygonRouteId, setPolygonRouteId] = useState<string | null>(null);

  // ── Derived ──
  const selectedConfig = useMemo(() => configs.find((c) => c.id === selectedId) ?? null, [configs, selectedId]);
  const canSave = Boolean(draft?.clientName && draft?.slug && draft.services.length > 0);
  const hasUnsaved = useMemo(() => {
    if (!draft || !selectedConfig) return false;
    return JSON.stringify(draft) !== JSON.stringify(selectedConfig);
  }, [draft, selectedConfig]);
  const filteredJobTypes = useMemo(() =>
    jobTypeLibrary.filter((jt) => !jobTypeQuery.trim() || jt.toLowerCase().includes(jobTypeQuery.toLowerCase())),
    [jobTypeQuery]
  );
  const selectedPolygonRoute = useMemo(() =>
    draft && polygonRouteId ? draft.calendarRoutes.find((r) => r.id === polygonRouteId) ?? null : null,
    [draft, polygonRouteId]
  );

  // ── Effects ──
  useEffect(() => {
    function sendHeight() {
      window.parent?.postMessage({ type: "MT_MIDDLEWARE_HEIGHT", height: document.documentElement.scrollHeight }, "*");
    }
    sendHeight();
    window.addEventListener("resize", sendHeight);
    const t = setInterval(sendHeight, 800);
    return () => { window.removeEventListener("resize", sendHeight); clearInterval(t); };
  }, [draft, events, routeResult, isJobTypeModalOpen, polygonRouteId]);

  useEffect(() => {
    async function load() {
      try {
        setIsLoading(true);
        const [cfgs, evts] = await Promise.all([fetchConfigs(), fetchEvents(60)]);
        setConfigs(cfgs);
        if (cfgs[0]) { setSelectedId(cfgs[0].id); setDraft(structuredClone(cfgs[0])); }
        setEvents(evts);
      } catch (err) {
        notify(err instanceof Error ? err.message : "Failed to load", "error");
      } finally { setIsLoading(false); }
    }
    void load();
  }, []);

  useEffect(() => {
    if (selectedConfig) {
      setDraft(structuredClone(selectedConfig));
      setJobTypeSelected(selectedConfig.services);
      setRouteInput((p) => ({ ...p, service: selectedConfig.services[0] ?? "" }));
    }
  }, [selectedConfig]);

  // ── Helpers ──
  function notify(message: string, type: "success" | "error" | "info" = "info") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }
  function updateDraft(fn: (c: ClientConfig) => ClientConfig) {
    setDraft((c) => (c ? fn(c) : c));
  }
  function toggleAccordion(key: string) {
    setAccordionOpen((p) => ({ ...p, [key]: !p[key] }));
  }

  // ── Action handlers ──
  function toggleBotMode(mode: BotMode) {
    updateDraft((c) => ({ ...c, pluginToggles: { ...c.pluginToggles, [mode]: !c.pluginToggles[mode] } }));
  }
  function toggleIndustry(industry: string) {
    updateDraft((c) => {
      const has = c.industries.includes(industry);
      return { ...c, industries: has ? c.industries.filter((x) => x !== industry) : [...c.industries, industry] };
    });
  }
  function toggleJobType(jt: string) {
    setJobTypeSelected((c) => c.includes(jt) ? c.filter((x) => x !== jt) : [...c, jt]);
  }
  function applyJobTypes() {
    updateDraft((c) => {
      const set = new Set(c.services);
      const merged = [...c.services];
      for (const jt of jobTypeSelected) { if (!set.has(jt)) { set.add(jt); merged.push(jt); } }
      return { ...c, services: merged };
    });
    setIsJobTypeModalOpen(false);
    notify(`Added ${jobTypeSelected.length} job type(s)`, "success");
  }

  async function handleSave() {
    if (!draft) return;
    try {
      setIsSaving(true);
      const saved = await updateConfig(draft.id, cloneConfigForSave(draft));
      setConfigs((c) => c.map((x) => (x.id === saved.id ? saved : x)));
      setDraft(structuredClone(saved));
      notify(`Saved at ${new Date(saved.updatedAt).toLocaleTimeString()}`, "success");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Save failed", "error");
    } finally { setIsSaving(false); }
  }

  async function handleClone() {
    if (!draft) return;
    try {
      setIsSaving(true);
      const suffix = Date.now().toString(36);
      const created = await createConfig(cloneConfigForSave({ ...draft, slug: `${draft.slug}_${suffix}`, clientName: `${draft.clientName} Copy` }));
      setConfigs((c) => [created, ...c]);
      setSelectedId(created.id);
      setDraft(structuredClone(created));
      notify(`Created "${created.clientName}"`, "success");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Clone failed", "error");
    } finally { setIsSaving(false); }
  }

  async function handleDelete() {
    if (!draft) return;
    if (configs.length <= 1) { notify("Keep at least one client config", "info"); return; }
    if (!window.confirm(`Delete "${draft.clientName}"? This cannot be undone.`)) return;
    try {
      setIsSaving(true);
      await deleteConfig(draft.id);
      const remaining = configs.filter((x) => x.id !== draft.id);
      const next = remaining[0] ?? null;
      setConfigs(remaining); setSelectedId(next?.id ?? ""); setDraft(next ? structuredClone(next) : null);
      notify(`Deleted "${draft.clientName}"`, "success");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Delete failed", "error");
    } finally { setIsSaving(false); }
  }

  async function handleRoutePreview() {
    if (!draft || !routeInput.service.trim()) return;
    try {
      setRouteLoading(true);
      const res = await previewRoute({
        clientId: draft.id, service: routeInput.service,
        zip: routeInput.zip || undefined,
        lat: routeInput.lat ? Number(routeInput.lat) : undefined,
        lng: routeInput.lng ? Number(routeInput.lng) : undefined,
        stage: routeInput.stage || undefined
      });
      setRouteResult({
        matched: res.decision.matched,
        calendar: res.decision.calendar ? `${res.decision.calendar.label} (${res.decision.calendar.ghlCalendarId})` : "No matching calendar",
        reason: res.decision.reason,
        pluginEnabled: res.pluginEnabled ?? false
      });
    } catch (err) {
      notify(err instanceof Error ? err.message : "Route preview failed", "error");
      setRouteResult(null);
    } finally { setRouteLoading(false); }
  }

  // ── Loading / empty ──
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(20,32,55,0.9) 0%, #080C14 70%)" }}>
        <div className="text-center space-y-4">
          <div className="relative mx-auto w-12 h-12">
            <div className="absolute inset-0 rounded-2xl bg-gold/20 animate-ping" />
            <div className="relative w-12 h-12 rounded-2xl flex items-center justify-center shadow-[0_0_24px_rgba(212,160,23,0.4)]" style={{ background: "linear-gradient(135deg, #D4A017, #F0C040)" }}>
              <Zap size={20} className="text-navy-950" />
            </div>
          </div>
          <div>
            <p className="text-[13px] font-semibold text-white mb-1">Voice Bot Builder</p>
            <p className="text-[12px] text-slate-600">Loading console…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: "#080C14" }}>
        <p className="text-slate-600 text-sm">No configuration found.</p>
      </div>
    );
  }

  // ── Tab renderers ──────────────────────────────────────────────────────────

  function renderBot() {
    if (!draft) return null;
    return (
      <div className="space-y-4">
        {/* Bot Modes */}
        <Card>
          <CardHeader title="Bot Modes" description="Which automation modes this voice agent handles. Multiple can be active simultaneously." />
          <CardBody>
            <div className="grid grid-cols-3 gap-3">
              {([
                { mode: "Appt Requested" as BotMode, Icon: Calendar, desc: "AI schedules appointments directly from the call" },
                { mode: "Appt Confirmed" as BotMode, Icon: CalendarCheck, desc: "Sends confirmation after a booking is made" },
                { mode: "Estimate Requested" as BotMode, Icon: FileText, desc: "Handles inbound estimate request calls" }
              ]).map(({ mode, Icon: MIcon, desc }) => {
                const on = Boolean(draft.pluginToggles[mode]);
                return (
                  <button key={mode} type="button" onClick={() => toggleBotMode(mode)}
                    className={`relative flex flex-col items-start gap-3 p-5 rounded-2xl text-left transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-gold/20 ${
                      on
                        ? "ring-1 ring-inset ring-gold/40 bg-gold/[0.07] shadow-[0_0_24px_rgba(212,160,23,0.08)]"
                        : "ring-1 ring-inset ring-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:ring-white/[0.1]"
                    }`}>
                    {on && (
                      <div className="absolute top-3.5 right-3.5 w-5 h-5 rounded-full flex items-center justify-center shadow-[0_0_8px_rgba(212,160,23,0.4)]" style={{ background: "linear-gradient(135deg, #C49010, #E8B520)" }}>
                        <Check size={9} className="text-[#0B0F1A]" />
                      </div>
                    )}
                    <MIcon size={20} className={on ? "text-gold" : "text-slate-600"} />
                    <div>
                      <p className={`text-[13px] font-semibold mb-1 tracking-[-0.01em] ${on ? "text-gold" : "text-slate-200"}`}>{mode}</p>
                      <p className="text-[11px] text-slate-600 leading-snug">{desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardBody>
        </Card>

        {/* Client Details */}
        <Card>
          <CardHeader title="Client Details" description="Core identity and GHL connection for this client account." />
          <CardBody className="grid grid-cols-2 gap-4">
            <div>
              <Label required>Client Name</Label>
              <Input value={draft.clientName} onChange={(v) => updateDraft((c) => ({ ...c, clientName: v }))} placeholder="Multiply Talents" />
            </div>
            <div>
              <Label required>Slug</Label>
              <Input value={draft.slug} onChange={(v) => updateDraft((c) => ({ ...c, slug: v }))} placeholder="multiply_talents" mono />
            </div>
            <div>
              <Label required>GHL Sub-Account ID</Label>
              <Input value={draft.ghlSubAccountId} onChange={(v) => updateDraft((c) => ({ ...c, ghlSubAccountId: v }))} placeholder="fifBD0MSR8EqqjlNkFbM" mono />
            </div>
            <div>
              <Label>Timezone</Label>
              <select value={draft.timezone} onChange={(e) => updateDraft((c) => ({ ...c, timezone: e.target.value }))}
                className="w-full bg-black/20 ring-1 ring-inset ring-white/[0.08] rounded-xl px-3.5 py-2.5 text-[13px] text-white focus:ring-gold/40 focus:outline-none hover:ring-white/[0.12] transition-all appearance-none">
                {["America/Los_Angeles","America/Denver","America/Chicago","America/New_York","America/Phoenix"].map((tz) =>
                  <option key={tz} value={tz}>{tz.replace("America/", "").replaceAll("_", " ")}</option>
                )}
                {!["America/Los_Angeles","America/Denver","America/Chicago","America/New_York","America/Phoenix"].includes(draft.timezone) &&
                  <option value={draft.timezone}>{draft.timezone.replace("America/", "").replaceAll("_", " ")}</option>}
              </select>
            </div>
          </CardBody>
        </Card>

        {/* Industries */}
        <Card>
          <CardHeader title="Industries" description="All industries this client operates in." />
          <CardBody>
            <div className="flex flex-wrap gap-2">
              {industryOptions.map((ind) => (
                <Pill key={ind} label={ind} active={draft.industries.includes(ind)}
                  onClick={() => toggleIndustry(ind)}
                  disabled={draft.industries.length <= 1 && draft.industries.includes(ind)} />
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  function renderServices() {
    if (!draft) return null;
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader title="Business Units"
            description="Organizational units within this client's business." />
          <CardBody>
            <div className="flex flex-wrap gap-2">
              {draft.businessUnits.map((unit, i) => (
                <Tag key={`${unit}-${i}`} label={unit} disabled={draft.businessUnits.length <= 1}
                  onRemove={() => updateDraft((c) => ({ ...c, businessUnits: c.businessUnits.filter((_, j) => j !== i) }))} />
              ))}
            </div>
            <AddInput placeholder="Add business unit and press Enter or +"
              onAdd={(v) => updateDraft((c) => ({ ...c, businessUnits: [...c.businessUnits, v] }))} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Services Offered" description="Used for routing leads to the correct calendar."
            action={
              <button type="button" onClick={() => setIsJobTypeModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-gold text-navy-950 rounded-lg hover:bg-gold-light transition-colors">
                <Plus size={13} /> Import Job Types
              </button>
            } />
          <CardBody>
            <div className="flex flex-wrap gap-2">
              {draft.services.map((svc, i) => (
                <Tag key={`${svc}-${i}`} label={svc}
                  onRemove={() => updateDraft((c) => ({ ...c, services: c.services.filter((_, j) => j !== i) }))} />
              ))}
            </div>
            <AddInput placeholder="Add service and press Enter or +"
              onAdd={(v) => updateDraft((c) => ({ ...c, services: [...c.services, v] }))} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Custom Questions" description="Questions the AI asks during the call." />
          <CardBody className="grid grid-cols-2 gap-4">
            {draft.customQuestions.map((q, i) => (
              <div key={q.id}>
                <Label>Question {i + 1}</Label>
                <Input value={q.label} onChange={(v) => updateDraft((c) => { const n = structuredClone(c); n.customQuestions[i].label = v; return n; })} />
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    );
  }

  function renderCalendars() {
    if (!draft) return null;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[13px] font-semibold text-white">Calendar Routes</h3>
            <p className="text-[12px] text-slate-500 mt-0.5">Each route handles specific services within a defined geographic zone.</p>
          </div>
          <button type="button" onClick={() => { const r = createEmptyRoute(draft.services); updateDraft((c) => ({ ...c, calendarRoutes: [...c.calendarRoutes, r] })); notify(`Added calendar: ${r.label}`, "info"); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-gold text-navy-950 rounded-lg hover:bg-gold-light transition-colors">
            <Plus size={13} /> Add Calendar
          </button>
        </div>

        {draft.calendarRoutes.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-white/10 rounded-xl bg-navy-800/20">
            <Calendar size={32} className="text-slate-700 mb-3" />
            <p className="text-[14px] font-medium text-slate-400 mb-1">No calendar routes yet</p>
            <p className="text-[12px] text-slate-600 mb-4">Add a route to map services to a GHL calendar.</p>
            <button type="button"
              onClick={() => { const r = createEmptyRoute(draft.services); updateDraft((c) => ({ ...c, calendarRoutes: [...c.calendarRoutes, r] })); notify(`Added calendar: ${r.label}`, "info"); }}
              className="flex items-center gap-1.5 px-4 py-2 text-[12px] font-medium bg-gold text-navy-950 rounded-lg hover:bg-gold-light transition-colors">
              <Plus size={13} /> Add First Calendar
            </button>
          </div>
        )}

        {draft.calendarRoutes.map((route, ri) => (
          <Card key={route.id}>
            <CardHeader
              title={route.label || "Untitled Calendar"}
              description={route.ghlCalendarId ? `ID: ${route.ghlCalendarId}` : "No GHL Calendar ID set"}
              action={
                <div className="flex gap-2">
                  <button type="button"
                    onClick={() => updateDraft((c) => { const n = structuredClone(c); n.calendarRoutes.push({ ...structuredClone(route), id: crypto.randomUUID(), label: `${route.label}-copy` }); return n; })}
                    className="p-1.5 text-slate-500 hover:text-white ring-1 ring-inset ring-white/[0.08] rounded-xl hover:bg-white/[0.06] transition-all" title="Clone">
                    <Copy size={13} />
                  </button>
                  <button type="button" disabled={draft.calendarRoutes.length <= 1}
                    onClick={() => updateDraft((c) => ({ ...c, calendarRoutes: c.calendarRoutes.filter((r) => r.id !== route.id) }))}
                    className="p-1.5 text-slate-500 hover:text-red-400 ring-1 ring-inset ring-white/[0.08] rounded-xl hover:ring-red-500/20 hover:bg-red-500/[0.06] transition-all disabled:opacity-30" title="Remove">
                    <Trash2 size={13} />
                  </button>
                </div>
              } />
            <CardBody className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Calendar Label</Label>
                  <Input value={route.label} onChange={(v) => updateDraft((c) => { const n = structuredClone(c); n.calendarRoutes[ri].label = v; return n; })} />
                </div>
                <div>
                  <Label required>GHL Calendar ID</Label>
                  <Input value={route.ghlCalendarId} mono onChange={(v) => updateDraft((c) => { const n = structuredClone(c); n.calendarRoutes[ri].ghlCalendarId = v; return n; })} placeholder="GHL calendar ID" />
                </div>
              </div>

              {/* Services checkboxes */}
              <div>
                <Label>Services this calendar handles</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {draft.services.map((svc) => {
                    const on = route.services.includes(svc);
                    return (
                      <button key={svc} type="button"
                        disabled={route.services.length <= 1 && on}
                        onClick={() => updateDraft((c) => { const n = structuredClone(c); const s = n.calendarRoutes[ri].services; n.calendarRoutes[ri].services = s.includes(svc) ? s.filter((x) => x !== svc) : [...s, svc]; return n; })}
                        className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all disabled:opacity-40 ${
                          on ? "bg-blue-500/20 border border-blue-500/40 text-blue-300" : "bg-navy-800 border border-white/10 text-slate-400 hover:border-white/20 hover:text-white"
                        }`}>
                        {on && <Check size={10} className="inline mr-1 mb-px" />}{svc}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Zone selector */}
              <div>
                <Label>Service Zone</Label>
                <div className="flex gap-1 p-1 bg-black/20 ring-1 ring-inset ring-white/[0.06] rounded-xl w-fit mt-1">
                  {([ ["NONE","None"], ["ZIP_LIST","ZIP List"], ["GEOFENCE_MI","Geofence"], ["POLYGON","Polygon"] ] as [AreaMode, string][]).map(([m, lbl]) => (
                    <button key={m} type="button"
                      onClick={() => { updateDraft((c) => { const n = structuredClone(c); n.calendarRoutes[ri].area.mode = m; return n; }); if (m === "POLYGON") setPolygonRouteId(route.id); }}
                      className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all ${route.area.mode === m ? "bg-navy-700 text-white" : "text-slate-500 hover:text-slate-300"}`}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              {route.area.mode === "ZIP_LIST" && (
                <div>
                  <Label>ZIP Codes</Label>
                  <input value={route.area.zipCodes.join(", ")} placeholder="78701, 78702, 78703"
                    onChange={(e) => updateDraft((c) => { const n = structuredClone(c); n.calendarRoutes[ri].area.zipCodes = parseZipCodes(e.target.value); return n; })}
                    className="w-full bg-black/20 ring-1 ring-inset ring-white/[0.08] rounded-xl px-3.5 py-2.5 text-[13px] text-white font-mono placeholder-slate-700 focus:ring-gold/40 focus:outline-none hover:ring-white/[0.12] transition-all" />
                </div>
              )}

              {route.area.mode === "GEOFENCE_MI" && (
                <div className="grid grid-cols-3 gap-3">
                  {(["centerLat","centerLng","radiusMi"] as const).map((k) => (
                    <div key={k}>
                      <Label>{k === "centerLat" ? "Center Lat" : k === "centerLng" ? "Center Lng" : "Radius (mi)"}</Label>
                      <input type="number" value={route.area.geofence?.[k] ?? ""}
                        onChange={(e) => updateDraft((c) => { const n = structuredClone(c); n.calendarRoutes[ri].area.geofence = { centerLat: n.calendarRoutes[ri].area.geofence?.centerLat ?? 0, centerLng: n.calendarRoutes[ri].area.geofence?.centerLng ?? 0, radiusMi: n.calendarRoutes[ri].area.geofence?.radiusMi ?? 10, [k]: Number(e.target.value) }; return n; })}
                        className="w-full bg-black/20 ring-1 ring-inset ring-white/[0.08] rounded-xl px-3.5 py-2.5 text-[13px] text-white font-mono focus:ring-gold/40 focus:outline-none hover:ring-white/[0.12] transition-all" />
                    </div>
                  ))}
                </div>
              )}

              {route.area.mode === "POLYGON" && (
                <div className="space-y-2">
                  <div>
                    <Label>Polygon Points (one per line: lat,lng)</Label>
                    <textarea rows={5} value={pointsToText(route.area.polygonPoints)}
                      onChange={(e) => updateDraft((c) => { const n = structuredClone(c); n.calendarRoutes[ri].area.polygonPoints = parsePolygonPoints(e.target.value); return n; })}
                      className="w-full bg-black/20 ring-1 ring-inset ring-white/[0.08] rounded-xl px-3.5 py-3 text-[12px] text-slate-400 font-mono focus:ring-gold/40 focus:outline-none hover:ring-white/[0.12] transition-all resize-none" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">{route.area.polygonPoints.length} points</span>
                    <button type="button" onClick={() => setPolygonRouteId(route.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-slate-400 ring-1 ring-inset ring-white/[0.08] rounded-xl hover:bg-white/[0.06] hover:text-white transition-all">
                      <Map size={12} /> Draw on Map
                    </button>
                  </div>
                </div>
              )}

              {route.area.mode !== "POLYGON" && (
                <div className="flex justify-end">
                  <button type="button" onClick={() => { updateDraft((c) => { const n = structuredClone(c); n.calendarRoutes[ri].area.mode = "POLYGON"; return n; }); setPolygonRouteId(route.id); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-slate-400 ring-1 ring-inset ring-white/[0.08] rounded-xl hover:bg-white/[0.06] hover:text-white transition-all">
                    <Map size={12} /> Draw on Map
                  </button>
                </div>
              )}
            </CardBody>
          </Card>
        ))}
      </div>
    );
  }

  function renderIntegrations() {
    if (!draft) return null;
    const fieldLabel = (k: keyof GhlFieldMappings) => ghlFieldMappingFields.find(([x]) => x === k)?.[1] ?? k;
    const fieldGroups: { key: string; title: string; info?: string; fields: (keyof GhlFieldMappings)[] }[] = [
      { key: "leadRouting", title: "Lead & Routing Fields", fields: ["leadSource","serviceRequest","serviceAreaZip","routedCalendarId"] },
      { key: "assignment",  title: "Assignment & Location", fields: ["locationBranch","assignedRep","serviceRequested","lastJobType","estimateStatus","declineReason"] },
      { key: "retell",      title: "Retell / n8n Auto-Populated", info: "These fields are populated automatically. Do not fill in manually.", fields: ["callDirection","callTranscript","externalLeadId"] },
    ];

    return (
      <div className="space-y-4">
        {/* CRM */}
        <Card>
          <CardHeader title="Connected CRM" description="Which CRM sends stage updates to this middleware." />
          <CardBody>
            <div className="max-w-xs">
              <Label>CRM Platform</Label>
              <select value={draft.connectedCrm} onChange={(e) => updateDraft((c) => ({ ...c, connectedCrm: e.target.value }))}
                className="w-full bg-black/20 ring-1 ring-inset ring-white/[0.08] rounded-xl px-3.5 py-2.5 text-[13px] text-white focus:ring-gold/40 focus:outline-none hover:ring-white/[0.12] transition-all appearance-none">
                {crmOptions.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </CardBody>
        </Card>

        {/* Stage Mappings */}
        <Card>
          <CardHeader title="Stage Mappings" description={`Map ${draft.connectedCrm} stages → GHL pipeline stages.`}
            action={
              <button type="button" onClick={() => updateDraft((c) => ({ ...c, stageMappings: [...c.stageMappings, { id: crypto.randomUUID(), externalStage: "", ghlStage: "", enabled: true }] }))}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-gold text-navy-950 rounded-lg hover:bg-gold-light transition-colors">
                <Plus size={13} /> Add Row
              </button>
            } />
          <div className="overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-white/[0.07]">
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{draft.connectedCrm} Stage</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">GHL Stage</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-center">Active</th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody>
                {draft.stageMappings.map((m: StageMapping, i) => (
                  <tr key={m.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3">
                      <input value={m.externalStage} onChange={(e) => updateDraft((c) => { const n = structuredClone(c); n.stageMappings[i].externalStage = e.target.value; return n; })}
                        className="w-full bg-black/20 ring-1 ring-inset ring-white/[0.08] rounded-xl px-3 py-2 text-[13px] text-white focus:ring-gold/40 focus:outline-none hover:ring-white/[0.12] transition-all" />
                    </td>
                    <td className="px-5 py-3">
                      <input value={m.ghlStage} onChange={(e) => updateDraft((c) => { const n = structuredClone(c); n.stageMappings[i].ghlStage = e.target.value; return n; })}
                        className="w-full bg-black/20 ring-1 ring-inset ring-white/[0.08] rounded-xl px-3 py-2 text-[13px] text-white focus:ring-gold/40 focus:outline-none hover:ring-white/[0.12] transition-all" />
                    </td>
                    <td className="px-5 py-3 text-center">
                      <Toggle on={m.enabled} onToggle={() => updateDraft((c) => { const n = structuredClone(c); n.stageMappings[i].enabled = !n.stageMappings[i].enabled; return n; })} />
                    </td>
                    <td className="pr-4 text-center">
                      <button type="button" disabled={draft.stageMappings.length <= 1}
                        onClick={() => updateDraft((c) => ({ ...c, stageMappings: c.stageMappings.filter((r) => r.id !== m.id) }))}
                        className="p-1.5 text-slate-600 hover:text-red-400 transition-colors disabled:opacity-30">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* GHL Field Mappings */}
        <Card>
          <CardHeader title="GHL Field Mappings" description="Custom field IDs — change here without touching Vercel env vars." />
          <CardBody className="space-y-2">
            {fieldGroups.map(({ key, title, info, fields }) => (
              <Accordion key={key} title={title} subtitle={`${fields.length} fields`} open={!!accordionOpen[key]} onToggle={() => toggleAccordion(key)}>
                {info && (
                  <div className="flex gap-2 items-start mb-3 px-3 py-2.5 bg-amber-500/[0.08] border border-amber-500/20 rounded-lg">
                    <AlertCircle size={13} className="text-amber-400 mt-0.5 flex-shrink-0" />
                    <p className="text-[12px] text-amber-300">{info}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  {fields.map((fk) => (
                    <div key={fk}>
                      <Label>{fieldLabel(fk)}</Label>
                      <input value={draft.ghlFieldMappings?.[fk] ?? ""} placeholder="GHL custom field ID"
                        onChange={(e) => updateDraft((c) => ({ ...c, ghlFieldMappings: { ...(c.ghlFieldMappings ?? {}), [fk]: e.target.value.trim() } }))}
                        className="w-full bg-black/20 ring-1 ring-inset ring-white/[0.08] rounded-xl px-3 py-2 text-[12px] text-slate-400 font-mono placeholder-slate-700 focus:ring-gold/40 focus:outline-none hover:ring-white/[0.12] transition-all" />
                    </div>
                  ))}
                </div>
              </Accordion>
            ))}
          </CardBody>
        </Card>

        {/* GHL Plugins */}
        <Card>
          <CardHeader title="GHL Plugins" description="Enable or disable GHL automation plugins for this client. Changes take effect on the next routed call." />
          <CardBody>
            <div className="grid grid-cols-2 gap-2">
              {Array.from(new Set([...pluginDefaults, ...Object.keys(draft.pluginToggles)])).map((plugin) => {
                const on = Boolean(draft.pluginToggles[plugin]);
                return (
                  <button key={plugin} type="button"
                    onClick={() => updateDraft((c) => ({ ...c, pluginToggles: { ...c.pluginToggles, [plugin]: !c.pluginToggles[plugin] } }))}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-xl border text-left transition-all ${
                      on ? "border-gold/40 bg-gold/[0.06]" : "border-white/[0.07] bg-navy-800/40 hover:border-white/15"
                    }`}>
                    <span className={`text-[12px] font-medium truncate ${on ? "text-gold" : "text-slate-400"}`}>{plugin}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ml-3 flex-shrink-0 ${on ? "bg-gold/20 text-gold" : "bg-white/[0.07] text-slate-600"}`}>
                      {on ? "ON" : "OFF"}
                    </span>
                  </button>
                );
              })}
            </div>
          </CardBody>
        </Card>

        {/* Auto fields */}
        <Card>
          <CardHeader title="Auto-Populated Fields" description="Fields Retell / n8n populate automatically on each call." />
          <CardBody>
            <div className="grid grid-cols-2 gap-2">
              {draft.autoFields.map((f, i) => (
                <div key={`${f.key}-${i}`} className="flex items-center justify-between px-3 py-2.5 bg-navy-800 border border-white/[0.07] rounded-lg">
                  <span className="text-[12px] text-slate-300">{f.label}</span>
                  <button type="button" onClick={() => updateDraft((c) => { const n = structuredClone(c); n.autoFields[i].required = !n.autoFields[i].required; return n; })}
                    className={`text-[10px] px-2 py-0.5 rounded-full font-semibold transition-colors ${f.required ? "bg-amber-500/20 text-amber-400" : "bg-white/[0.08] text-slate-500 hover:bg-white/15"}`}>
                    {f.required ? "required" : "optional"}
                  </button>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  function renderTest() {
    if (!draft) return null;
    const checklist = [
      { label: "Client details complete", ok: Boolean(draft.clientName && draft.slug && draft.ghlSubAccountId), desc: "Name, slug, and GHL sub-account ID filled in" },
      { label: "At least one calendar with ID", ok: draft.calendarRoutes.length > 0 && draft.calendarRoutes.every((r) => r.ghlCalendarId.trim().length > 0), desc: "All calendar routes have a real GHL Calendar ID" },
      { label: "Services defined", ok: draft.services.length > 0, desc: "At least one service type added" },
      { label: "Route test passed", ok: Boolean(routeResult?.matched), desc: "Run the test below to validate routing logic" },
    ];

    return (
      <div className="space-y-4">
        <Card>
          <CardHeader title="Route Preview Test" description="Simulate a call and see exactly which calendar gets routed, and whether the GHL plugin is active." />
          <CardBody>
            <div className="grid grid-cols-5 gap-3 mb-4">
              <div className="col-span-2">
                <Label>Service</Label>
                <select value={routeInput.service} onChange={(e) => setRouteInput((p) => ({ ...p, service: e.target.value }))}
                  className="w-full bg-black/20 ring-1 ring-inset ring-white/[0.08] rounded-xl px-3.5 py-2.5 text-[13px] text-white focus:ring-gold/40 focus:outline-none hover:ring-white/[0.12] transition-all appearance-none">
                  {draft.services.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <Label>ZIP</Label>
                <Input value={routeInput.zip} onChange={(v) => setRouteInput((p) => ({ ...p, zip: v }))} placeholder="78701" />
              </div>
              <div>
                <Label>Lat</Label>
                <Input value={routeInput.lat} onChange={(v) => setRouteInput((p) => ({ ...p, lat: v }))} placeholder="30.26" />
              </div>
              <div>
                <Label>Lng</Label>
                <Input value={routeInput.lng} onChange={(v) => setRouteInput((p) => ({ ...p, lng: v }))} placeholder="-97.74" />
              </div>
            </div>
            <button type="button" onClick={handleRoutePreview} disabled={routeLoading || !routeInput.service.trim()}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-gold text-navy-950 text-[13px] font-semibold rounded-lg hover:bg-gold-light disabled:opacity-50 transition-colors">
              <TestTube2 size={14} /> {routeLoading ? "Testing..." : "Run Route Test"}
            </button>

            {routeResult && (
              <div className={`mt-4 p-4 rounded-xl border ${routeResult.matched ? "border-green-500/25 bg-green-500/[0.07]" : "border-red-500/25 bg-red-500/[0.07]"}`}>
                <div className={`flex items-center gap-2 text-[13px] font-semibold mb-3 ${routeResult.matched ? "text-green-400" : "text-red-400"}`}>
                  {routeResult.matched ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                  {routeResult.matched ? "Route Matched" : "No Match"}
                </div>
                <dl className="space-y-2 text-[12px]">
                  {[
                    { dt: "Calendar", dd: routeResult.calendar },
                    { dt: "Reason", dd: routeResult.reason },
                    { dt: "GHL Plugin", dd: routeResult.pluginEnabled ? "✓ Enabled" : "✗ Disabled" },
                  ].map(({ dt, dd }) => (
                    <div key={dt} className="flex gap-3">
                      <dt className="text-slate-500 w-16 flex-shrink-0">{dt}</dt>
                      <dd className="text-slate-200">{dd}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Publish Checklist" description="Verify everything is configured before going live with real calls." />
          <CardBody>
            <div className="space-y-2 mb-5">
              {checklist.map(({ label, ok, desc }) => (
                <div key={label} className={`flex items-start gap-3 px-4 py-3 rounded-xl border transition-all ${ok ? "border-green-500/20 bg-green-500/[0.06]" : "border-white/[0.07] bg-navy-800/40"}`}>
                  {ok ? <CheckCircle2 size={15} className="text-green-400 flex-shrink-0 mt-0.5" /> : <AlertCircle size={15} className="text-slate-500 flex-shrink-0 mt-0.5" />}
                  <div>
                    <p className={`text-[13px] font-medium ${ok ? "text-green-300" : "text-slate-300"}`}>{label}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" disabled={!checklist.every((c) => c.ok)} onClick={handleSave}
              className={`w-full flex items-center justify-center gap-2 py-3 text-[13px] font-semibold rounded-xl transition-all ${
                checklist.every((c) => c.ok)
                  ? "bg-gold text-navy-950 hover:bg-gold-light"
                  : "bg-white/[0.04] text-slate-600 border border-white/[0.07] cursor-not-allowed"
              }`}>
              <Rocket size={14} />
              {checklist.every((c) => c.ok) ? "Save & Publish Config" : "Complete checklist to publish"}
            </button>
          </CardBody>
        </Card>
      </div>
    );
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  const tabContent: Record<TabId, () => React.ReactNode> = {
    bot: renderBot,
    services: renderServices,
    calendars: renderCalendars,
    integrations: renderIntegrations,
    test: renderTest,
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ fontFamily: "Inter, system-ui, sans-serif", background: "radial-gradient(ellipse 100% 50% at 20% 0%, rgba(16,28,48,0.7) 0%, transparent 55%), #080C14" }}>

      {/* ── LEFT SIDEBAR ── */}
      <aside className="w-60 flex-shrink-0 flex flex-col border-r border-white/[0.06]" style={{ background: "#0B1120" }}>

        {/* Logo */}
        <div className="px-5 py-6 border-b border-white/[0.06]">
          <div className="flex items-center gap-3 mb-5">
            <div className="relative w-9 h-9 flex-shrink-0">
              <div className="absolute inset-0 rounded-xl bg-gold/25 blur-md" />
              <div className="relative w-9 h-9 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(212,160,23,0.35)]" style={{ background: "linear-gradient(135deg, #C49010, #E8B520)" }}>
                <Zap size={16} className="text-[#0B0F1A]" />
              </div>
            </div>
            <div>
              <p className="text-[9px] font-bold tracking-[0.14em] text-gold/60 uppercase leading-none">UMMG</p>
              <p className="text-[13px] font-semibold text-white leading-tight mt-0.5 tracking-[-0.01em]">Voice Bot Builder</p>
            </div>
          </div>

          {/* Client selector */}
          <div className="relative">
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}
              className="w-full bg-white/[0.05] ring-1 ring-inset ring-white/[0.08] rounded-xl pl-3 pr-8 py-2.5 text-[12px] text-slate-300 appearance-none cursor-pointer focus:ring-gold/40 focus:outline-none hover:bg-white/[0.07] transition-all">
              {configs.map((cfg) => <option key={cfg.id} value={cfg.id}>{cfg.clientName}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-px">
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button key={id} type="button" onClick={() => setActiveTab(id)}
                className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150 ${
                  active
                    ? "bg-gold/[0.1] text-gold ring-1 ring-inset ring-gold/20"
                    : "text-slate-400 hover:text-white hover:bg-white/[0.06] ring-1 ring-inset ring-transparent hover:ring-white/[0.06]"
                }`}>
                {active && <span className="absolute left-0 inset-y-[8px] w-[3px] bg-gold rounded-full" />}
                <Icon size={16} className={`flex-shrink-0 ${active ? "text-gold" : "text-slate-500"}`} />
                <span className="text-[12px] font-medium">{label}</span>
              </button>
            );
          })}
        </nav>

        {/* Connection status */}
        <div className="px-4 py-5 border-t border-white/[0.06]">
          <p className="text-[9px] font-bold text-slate-700 uppercase tracking-[0.12em] mb-3">Connections</p>
          {[
            { name: "Retell AI", ok: true },
            { name: "GoHighLevel", ok: Boolean(draft.ghlSubAccountId) },
            { name: draft.connectedCrm, ok: Boolean(draft.connectedCrm) },
          ].map(({ name, ok }) => (
            <div key={name} className="flex items-center gap-2 py-1.5">
              <span className="relative flex-shrink-0 w-2 h-2">
                <span className={`absolute inset-0 rounded-full ${ok ? "bg-emerald-500" : "bg-red-400/50"}`} />
                {ok && <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-30" />}
              </span>
              <span className="text-[11px] text-slate-500 truncate">{name}</span>
              <span className={`ml-auto text-[10px] font-semibold flex-shrink-0 ${ok ? "text-emerald-500" : "text-red-400/70"}`}>{ok ? "ON" : "—"}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* ── MAIN AREA ── */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* Top bar */}
        <header className="flex-shrink-0 flex items-center justify-between h-[58px] px-6 border-b border-white/[0.06]" style={{ background: "rgba(8,12,20,0.95)", backdropFilter: "blur(16px)" }}>
          <div className="flex items-center gap-3">
            <h1 className="text-[14px] font-semibold text-white tracking-[-0.01em]">{NAV_ITEMS.find((n) => n.id === activeTab)?.label}</h1>
            {hasUnsaved && (
              <span className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 bg-amber-500/10 text-amber-400/90 rounded-full ring-1 ring-inset ring-amber-500/20 font-semibold tracking-wide">
                <span className="w-1 h-1 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />UNSAVED
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={handleDelete} disabled={isSaving || configs.length <= 1}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-red-400/60 ring-1 ring-inset ring-white/[0.07] rounded-xl hover:ring-red-500/20 hover:bg-red-500/[0.07] hover:text-red-400 disabled:opacity-30 transition-all">
              <Trash2 size={13} /> Delete
            </button>
            <button type="button" onClick={handleClone} disabled={isSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-slate-400 ring-1 ring-inset ring-white/[0.07] rounded-xl hover:ring-white/[0.12] hover:bg-white/[0.05] hover:text-white disabled:opacity-30 transition-all">
              <Copy size={13} /> Clone
            </button>
            <div className="w-px h-5 bg-white/[0.07] mx-1" />
            <button type="button" onClick={handleSave} disabled={!canSave || isSaving}
              className={`flex items-center gap-1.5 px-4 py-1.5 text-[12px] font-semibold rounded-lg transition-all duration-150 disabled:opacity-40 ${
                hasUnsaved
                  ? "bg-gold text-navy-950 hover:bg-gold-light shadow-[0_0_16px_rgba(212,160,23,0.3)]"
                  : "bg-gold/60 text-navy-950 hover:bg-gold/80"
              }`}>
              <Check size={12} /> {isSaving ? "Saving…" : "Save"}
            </button>
          </div>
        </header>

        {/* Content + right sidebar */}
        <div className="flex flex-1 overflow-hidden">

          {/* Scrollable form area */}
          <main className="flex-1 overflow-y-auto p-7">
            {tabContent[activeTab]()}
          </main>

          {/* ── RIGHT SIDEBAR ── */}
          <aside className="w-[260px] flex-shrink-0 flex flex-col border-l border-white/[0.06] overflow-y-auto" style={{ background: "#0B1120" }}>

            {/* Config summary */}
            <div className="p-5 border-b border-white/[0.06]">
              <p className="text-[9px] font-bold text-slate-700 uppercase tracking-[0.12em] mb-4">Config Preview</p>
              <dl className="space-y-3">
                {([
                  ["Client",     draft.clientName],
                  ["Slug",       draft.slug],
                  ["CRM",        draft.connectedCrm],
                  ["Timezone",   draft.timezone.replace("America/", "").replaceAll("_", " ")],
                  ["Industries", draft.industries.slice(0, 2).join(", ") + (draft.industries.length > 2 ? ` +${draft.industries.length - 2}` : "")],
                  ["Services",   `${draft.services.length} configured`],
                  ["Calendars",  `${draft.calendarRoutes.length} route${draft.calendarRoutes.length !== 1 ? "s" : ""}`],
                ] as [string, string][]).map(([k, v]) => (
                  <div key={k} className="flex gap-3 items-baseline">
                    <dt className="text-[9px] text-slate-700 w-14 flex-shrink-0 font-semibold uppercase tracking-[0.08em]">{k}</dt>
                    <dd className="text-[12px] text-slate-400 truncate min-w-0">{v || "—"}</dd>
                  </div>
                ))}
              </dl>
              <details className="mt-4 group">
                <summary className="list-none [&::-webkit-details-marker]:hidden text-[10px] text-slate-600 hover:text-slate-300 cursor-pointer select-none transition-colors flex items-center gap-1">
                  <ChevronDown size={10} className="transition-transform duration-150 group-open:rotate-180" /> JSON
                </summary>
                <pre className="mt-2 p-3 bg-black/20 ring-1 ring-inset ring-white/[0.06] rounded-xl text-[9px] text-slate-500 font-mono overflow-auto max-h-40 leading-relaxed">{JSON.stringify(draft, null, 2)}</pre>
              </details>
            </div>

            {/* Recent Events */}
            <div className="p-5 flex-1">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[9px] font-bold text-slate-700 uppercase tracking-[0.12em]">Recent Events</p>
                <button type="button" onClick={async () => { try { setEvents(await fetchEvents(40)); } catch { /* silent */ } }}
                  className="text-[10px] text-slate-700 hover:text-slate-400 transition-colors font-medium">Refresh</button>
              </div>
              {events.length === 0
                ? (
                  <div className="flex flex-col items-center py-8 text-center">
                    <div className="w-8 h-8 rounded-xl bg-white/[0.03] ring-1 ring-inset ring-white/[0.06] flex items-center justify-center mb-3">
                      <Rocket size={14} className="text-slate-700" />
                    </div>
                    <p className="text-[11px] text-slate-700">No events yet</p>
                    <p className="text-[10px] text-slate-600 mt-0.5">Webhook calls will appear here</p>
                  </div>
                )
                : (
                  <div className="space-y-1.5">
                    {events.map((ev) => (
                      <div key={ev.id} className="flex items-center gap-2 px-3 py-2.5 bg-white/[0.025] rounded-xl ring-1 ring-inset ring-white/[0.04] hover:bg-white/[0.04] transition-colors">
                        <TypeBadge type={ev.eventType} />
                        <StatusBadge status={ev.status} />
                        <span className="text-[9px] text-slate-700 ml-auto flex-shrink-0 font-medium">{timeAgo(ev.receivedAt)}</span>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          </aside>
        </div>
      </div>

      {/* ── MODALS ── */}
      {isJobTypeModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl flex flex-col bg-navy-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden" style={{ maxHeight: "85vh" }}>
            <header className="flex items-start justify-between gap-4 px-5 py-4 border-b border-white/[0.07] flex-shrink-0">
              <div>
                <h3 className="text-[15px] font-semibold text-white">Import Job Types</h3>
                <p className="text-[12px] text-slate-500 mt-0.5">Select services to add to your list.</p>
              </div>
              <button type="button" onClick={() => setIsJobTypeModalOpen(false)}
                className="p-1.5 text-slate-500 hover:text-white ring-1 ring-inset ring-white/[0.08] rounded-xl hover:bg-white/[0.06] transition-all flex-shrink-0">
                <X size={14} />
              </button>
            </header>
            <div className="px-5 py-3 border-b border-white/[0.07] bg-navy-800/40 flex-shrink-0 space-y-3">
              <div className="flex gap-1 p-1 bg-black/20 ring-1 ring-inset ring-white/[0.06] rounded-xl w-fit">
                {(["crm","manual"] as const).map((src) => (
                  <button key={src} type="button" onClick={() => setJobTypeSource(src)}
                    className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all ${
                      jobTypeSource === src ? "bg-navy-700 text-white" : "text-slate-500 hover:text-slate-300"
                    }`}>
                    {src === "crm" ? `CRM (${draft.connectedCrm})` : "Manual List"}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <input value={jobTypeQuery} onChange={(e) => setJobTypeQuery(e.target.value)} placeholder="Search job types..."
                  className="flex-1 bg-black/20 ring-1 ring-inset ring-white/[0.08] rounded-xl px-3.5 py-2 text-[13px] text-white placeholder-slate-700 focus:ring-gold/40 focus:outline-none hover:ring-white/[0.12] transition-all" />
                <span className="text-[12px] text-slate-500 whitespace-nowrap">{jobTypeSelected.length} selected</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-2">
                {filteredJobTypes.map((jt) => {
                  const checked = jobTypeSelected.includes(jt);
                  return (
                    <label key={jt} onClick={() => toggleJobType(jt)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${
                        checked ? "border-gold/40 bg-gold/[0.06]" : "border-white/[0.07] bg-navy-800/40 hover:border-white/15"
                      }`}>
                      <div className={`w-4 h-4 rounded flex-shrink-0 border flex items-center justify-center transition-all ${
                        checked ? "bg-gold border-gold" : "border-white/20"
                      }`}>
                        {checked && <Check size={10} className="text-navy-950" />}
                      </div>
                      <span className="text-[12px] text-slate-300">{jt}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-white/[0.07] flex-shrink-0">
              <button type="button" onClick={() => setIsJobTypeModalOpen(false)}
                className="px-4 py-2 text-[13px] text-slate-500 ring-1 ring-inset ring-white/[0.08] rounded-xl hover:text-white hover:bg-white/[0.06] transition-all">
                Cancel
              </button>
              <button type="button" onClick={applyJobTypes} disabled={jobTypeSelected.length === 0}
                className="px-4 py-2 text-[13px] font-semibold bg-gold text-navy-950 rounded-lg hover:bg-gold-light disabled:opacity-40 transition-colors">
                Add {jobTypeSelected.length} selected
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedPolygonRoute && (
        <PolygonMapModal
          title={`Draw Service Area — ${selectedPolygonRoute.label || "Calendar"}`}
          initialPoints={selectedPolygonRoute.area.polygonPoints}
          onClose={() => setPolygonRouteId(null)}
          onUseArea={(pts) => {
            updateDraft((c) => {
              const n = structuredClone(c);
              const idx = n.calendarRoutes.findIndex((r) => r.id === selectedPolygonRoute.id);
              if (idx >= 0) { n.calendarRoutes[idx].area.mode = "POLYGON"; n.calendarRoutes[idx].area.polygonPoints = pts; }
              return n;
            });
            setPolygonRouteId(null);
            notify(`Polygon updated: ${pts.length} points`, "success");
          }}
        />
      )}

      {/* Toast notification */}
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  );
}
