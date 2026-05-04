import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Polygon, Polyline, TileLayer, useMapEvents } from "react-leaflet";
import {
  createConfig,
  deleteConfig,
  fetchConfigs,
  fetchEvents,
  previewRoute,
  updateConfig
} from "./api/client";
import type { AreaMode, CalendarRoute, ClientConfig, EventLog, StageMapping } from "./types";
import "./styles.css";

const industryOptions = [
  "HVAC",
  "Plumbing",
  "Electrical",
  "Garage Doors",
  "Solar",
  "Roofing",
  "Landscaping",
  "Painting",
  "Fencing",
  "Windows",
  "Remodeling",
  "Other"
];

const crmOptions = ["ServiceTitan", "JobNimbus", "Housecall Pro", "FieldPulse", "Custom"];
const stageOptions = ["Appt Requested", "Appt Confirmed", "Estimate Requested"];

const pluginDefaults = [
  "New Lead",
  "Appt Requested",
  "Appt Booked",
  "Welcome Funnel",
  "Callback Requested",
  "Estimate Sent",
  "Disposition",
  "Review",
  "Annual Lead",
  "Annual Customer"
];

const botModeKeys = ["Appt Requested", "Appt Confirmed", "Estimate Requested"] as const;
type BotMode = (typeof botModeKeys)[number];

type JobTypeSource = "crm" | "manual";

const jobTypeLibrary = [
  "AC Repair",
  "AC Install / Replacement",
  "AC Tune-up",
  "Furnace Repair",
  "Furnace Install / Replacement",
  "Heat Pump Install",
  "Heat Pump Repair",
  "Ductless Mini-Split",
  "Duct Cleaning",
  "Smart Thermostat",
  "HVAC Inspection",
  "Maintenance Plan",
  "Leak / Pipe Repair",
  "Water Heater Repair",
  "Water Heater Install",
  "Tankless Water Heater",
  "Drain Cleaning",
  "Sewer Line Repair",
  "Fixture Install (Faucet/Toilet)",
  "Whole-home Plumbing Inspection",
  "Panel Upgrade",
  "Wiring / Outlet Repair"
];

interface MapPoint {
  lat: number;
  lng: number;
}

interface PolygonMapModalProps {
  title: string;
  initialPoints: MapPoint[];
  onUseArea: (points: MapPoint[]) => void;
  onClose: () => void;
}

function PolygonMapClickCapture({ onAddPoint }: { onAddPoint: (point: MapPoint) => void }) {
  useMapEvents({
    click(event) {
      onAddPoint({
        lat: event.latlng.lat,
        lng: event.latlng.lng
      });
    }
  });

  return null;
}

function PolygonMapModal({ title, initialPoints, onUseArea, onClose }: PolygonMapModalProps) {
  const [points, setPoints] = useState<MapPoint[]>(initialPoints);

  const center: [number, number] =
    points.length > 0 ? [points[0].lat, points[0].lng] : [34.052235, -118.243683];

  const leafletPoints = points.map((point) => [point.lat, point.lng] as [number, number]);

  return (
    <div className="modal-backdrop">
      <div className="modal-card map-modal">
        <header className="modal-header">
          <div>
            <h3>{title}</h3>
            <p>Click the map to add polygon points. Use at least 3 points.</p>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="map-toolbar">
          <button
            type="button"
            className="ghost-button"
            onClick={() => setPoints((current) => current.slice(0, Math.max(current.length - 1, 0)))}
          >
            Delete last point
          </button>
          <button type="button" className="ghost-button" onClick={() => setPoints([])}>
            Clear
          </button>
          <span>{points.length} points</span>
          <button
            type="button"
            className="primary-button"
            disabled={points.length < 3}
            onClick={() => onUseArea(points)}
          >
            Use Area
          </button>
        </div>

        <div className="map-wrapper">
          <MapContainer center={center} zoom={13} scrollWheelZoom className="leaflet-map">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <PolygonMapClickCapture
              onAddPoint={(point) => {
                setPoints((current) => [...current, point]);
              }}
            />
            {leafletPoints.length >= 2 && <Polyline positions={leafletPoints} pathOptions={{ color: "#ff5b70", weight: 3 }} />}
            {leafletPoints.length >= 3 && (
              <Polygon positions={leafletPoints} pathOptions={{ color: "#ff3b5d", fillColor: "#ff3b5d", fillOpacity: 0.28 }} />
            )}
            {leafletPoints.map((point, index) => (
              <CircleMarker key={`${point[0]}-${point[1]}-${index}`} center={point} radius={6} pathOptions={{ color: "#ffffff" }} />
            ))}
          </MapContainer>
        </div>
      </div>
    </div>
  );
}

function createEmptyRoute(services: string[]): CalendarRoute {
  const firstService = services[0] ?? "General Service";

  return {
    id: crypto.randomUUID(),
    label: firstService,
    ghlCalendarId: "ghl_calendar_id",
    services: [firstService],
    area: {
      mode: "NONE",
      zipCodes: [],
      polygonPoints: []
    }
  };
}

function cloneConfigForSave(config: ClientConfig): Omit<ClientConfig, "id" | "createdAt" | "updatedAt"> {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = config;
  void _id;
  void _createdAt;
  void _updatedAt;
  return rest;
}

function parseZipCodes(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePolygonPoints(value: string): { lat: number; lng: number }[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [latRaw, lngRaw] = line.split(",").map((item) => item.trim());
      return {
        lat: Number(latRaw),
        lng: Number(lngRaw)
      };
    })
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function pointsToText(points: { lat: number; lng: number }[]): string {
  return points.map((point) => `${point.lat},${point.lng}`).join("\n");
}

function App() {
  const [configs, setConfigs] = useState<ClientConfig[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [draft, setDraft] = useState<ClientConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [events, setEvents] = useState<EventLog[]>([]);

  const [routeInput, setRouteInput] = useState({
    service: "",
    zip: "",
    lat: "",
    lng: "",
    stage: "New Lead"
  });
  const [routeResult, setRouteResult] = useState<{ matched: boolean; calendar: string; reason: string; pluginEnabled: boolean } | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [jobTypeSource, setJobTypeSource] = useState<JobTypeSource>("manual");
  const [jobTypeQuery, setJobTypeQuery] = useState<string>("");
  const [isJobTypeModalOpen, setIsJobTypeModalOpen] = useState(false);
  const [jobTypeSelected, setJobTypeSelected] = useState<string[]>([]);
  const [polygonRouteId, setPolygonRouteId] = useState<string | null>(null);

  const selectedConfig = useMemo(() => configs.find((cfg) => cfg.id === selectedId) ?? null, [configs, selectedId]);

  useEffect(() => {
    async function load(): Promise<void> {
      try {
        setIsLoading(true);
        const [cfgs, eventLogs] = await Promise.all([fetchConfigs(), fetchEvents(60)]);
        setConfigs(cfgs);
        if (cfgs[0]) {
          setSelectedId(cfgs[0].id);
          setDraft(structuredClone(cfgs[0]));
        }
        setEvents(eventLogs);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Failed to load configuration");
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, []);

  useEffect(() => {
    if (selectedConfig) {
      setDraft(structuredClone(selectedConfig));
      setJobTypeSelected(selectedConfig.services);
      setRouteInput((prev) => ({
        ...prev,
        service: selectedConfig.services[0] ?? ""
      }));
    }
  }, [selectedConfig]);

  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(""), 5000);
    return () => clearTimeout(timer);
  }, [status]);

  const canSave = Boolean(draft && draft.clientName && draft.slug && draft.services.length > 0);
  const filteredJobTypes = useMemo(
    () =>
      jobTypeLibrary.filter((jobType) => {
        if (jobTypeQuery.trim().length === 0) {
          return true;
        }

        return jobType.toLowerCase().includes(jobTypeQuery.trim().toLowerCase());
      }),
    [jobTypeQuery]
  );
  const hasUnsavedChanges = useMemo(() => {
    if (!draft || !selectedConfig) return false;
    return JSON.stringify(draft) !== JSON.stringify(selectedConfig);
  }, [draft, selectedConfig]);

  const statusClass = status.toLowerCase().includes("fail") || status.toLowerCase().includes("error")
    ? "error"
    : status.toLowerCase().includes("saved") || status.toLowerCase().includes("created") || status.toLowerCase().includes("deleted")
    ? "success"
    : "";

  const selectedPolygonRoute = useMemo(
    () => (draft && polygonRouteId ? draft.calendarRoutes.find((route) => route.id === polygonRouteId) ?? null : null),
    [draft, polygonRouteId]
  );

  function updateDraft(update: (current: ClientConfig) => ClientConfig): void {
    setDraft((current) => (current ? update(current) : current));
  }

  function toggleJobType(jobType: string): void {
    setJobTypeSelected((current) =>
      current.includes(jobType) ? current.filter((entry) => entry !== jobType) : [...current, jobType]
    );
  }

  function applyJobTypesToServices(): void {
    updateDraft((current) => {
      const existing = new Set(current.services);
      const merged = [...current.services];
      for (const jobType of jobTypeSelected) {
        if (!existing.has(jobType)) {
          existing.add(jobType);
          merged.push(jobType);
        }
      }
      return {
        ...current,
        services: merged
      };
    });

    setIsJobTypeModalOpen(false);
    setStatus(`Added ${jobTypeSelected.length} job type(s) into Services`);
  }

  function toggleBotMode(mode: BotMode): void {
    updateDraft((current) => ({
      ...current,
      pluginToggles: {
        ...current.pluginToggles,
        [mode]: !current.pluginToggles[mode]
      }
    }));
  }

  function toggleIndustry(industry: string): void {
    updateDraft((current) => {
      const has = current.industries.includes(industry);
      return {
        ...current,
        industries: has ? current.industries.filter((item) => item !== industry) : [...current.industries, industry]
      };
    });
  }

  async function handleSave(): Promise<void> {
    if (!draft) {
      return;
    }

    try {
      setIsSaving(true);
      setStatus("Saving config...");

      const payload = cloneConfigForSave(draft);
      const saved = await updateConfig(draft.id, payload);

      setConfigs((current) => current.map((item) => (item.id === saved.id ? saved : item)));
      setDraft(structuredClone(saved));
      setStatus(`Saved at ${new Date(saved.updatedAt).toLocaleString()}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to save config");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateClone(): Promise<void> {
    if (!draft) {
      return;
    }

    try {
      setIsSaving(true);
      const suffix = Date.now().toString(36);
      const payload = cloneConfigForSave({
        ...draft,
        slug: `${draft.slug}_${suffix}`,
        clientName: `${draft.clientName} Copy`
      });

      const created = await createConfig(payload);
      setConfigs((current) => [created, ...current]);
      setSelectedId(created.id);
      setDraft(structuredClone(created));
      setStatus(`Created ${created.clientName}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to clone config");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteClient(): Promise<void> {
    if (!draft) {
      return;
    }

    if (configs.length <= 1) {
      setStatus("Keep at least one client config in the console");
      return;
    }

    if (!window.confirm(`Delete ${draft.clientName}? This cannot be undone.`)) {
      return;
    }

    try {
      setIsSaving(true);
      await deleteConfig(draft.id);

      const remaining = configs.filter((item) => item.id !== draft.id);
      const nextSelected = remaining[0] ?? null;

      setConfigs(remaining);
      setSelectedId(nextSelected?.id ?? "");
      setDraft(nextSelected ? structuredClone(nextSelected) : null);
      setStatus(`Deleted ${draft.clientName}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to delete client");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRoutePreview(): Promise<void> {
    if (!draft || routeInput.service.trim().length === 0) {
      return;
    }

    try {
      setRouteLoading(true);
      const response = await previewRoute({
        clientId: draft.id,
        service: routeInput.service,
        zip: routeInput.zip || undefined,
        lat: routeInput.lat ? Number(routeInput.lat) : undefined,
        lng: routeInput.lng ? Number(routeInput.lng) : undefined,
        stage: routeInput.stage || undefined
      });

      setRouteResult({
        matched: response.decision.matched,
        calendar: response.decision.calendar
          ? `${response.decision.calendar.label} (${response.decision.calendar.ghlCalendarId})`
          : "No target calendar",
        reason: response.decision.reason,
        pluginEnabled: response.pluginEnabled ?? false
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Route preview failed");
      setRouteResult(null);
    } finally {
      setRouteLoading(false);
    }
  }

  if (isLoading) {
    return <div className="screen-center">Loading middleware console...</div>;
  }

  if (!draft) {
    return <div className="screen-center">{status || "No config found. Seed data should load automatically."}</div>;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Multiply Talents</p>
          <h1>
            <span className="brand-main">Multiply Talents</span> Voice Bot Builder
          </h1>
          <p className="topbar-description">
            Set up how AI books: choose bot mode, job types, service areas, and map everything to the right calendar.
          </p>
        </div>
        <div className="toolbar">
          <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
            {configs.map((cfg) => (
              <option key={cfg.id} value={cfg.id}>
                {cfg.clientName}
              </option>
            ))}
          </select>
          <button onClick={handleCreateClone} disabled={isSaving} className="ghost-button">
            Clone Client
          </button>
          <button onClick={handleDeleteClient} disabled={isSaving || configs.length <= 1} className="danger-button">
            Delete Client
          </button>
          <button onClick={handleSave} disabled={!canSave || isSaving} className="primary-button">
            {isSaving ? "Saving..." : hasUnsavedChanges ? "Save Changes *" : "Save Config"}
          </button>
        </div>
      </header>

      <main className="layout-grid">
        <section className="left-column">
          <div className="card">
            <h2>Bot Modes</h2>
            <div className="chips-wrap">
              {botModeKeys.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={draft.pluginToggles[mode] ? "chip active" : "chip"}
                  onClick={() => toggleBotMode(mode)}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <h2>Client Details</h2>
            <div className="grid-two">
              <label>
                Client Name
                <input
                  value={draft.clientName}
                  onChange={(event) => updateDraft((current) => ({ ...current, clientName: event.target.value }))}
                />
              </label>
              <label>
                Slug
                <input value={draft.slug} onChange={(event) => updateDraft((current) => ({ ...current, slug: event.target.value }))} />
              </label>
              <label>
                GHL Sub-Account ID
                <input
                  value={draft.ghlSubAccountId}
                  onChange={(event) => updateDraft((current) => ({ ...current, ghlSubAccountId: event.target.value }))}
                />
              </label>
              <label>
                Timezone
                <input
                  value={draft.timezone}
                  onChange={(event) => updateDraft((current) => ({ ...current, timezone: event.target.value }))}
                />
              </label>
            </div>
          </div>

          <div className="card">
            <h2>Industries</h2>
            <div className="chips-wrap">
              {industryOptions.map((industry) => (
                <button
                  key={industry}
                  className={draft.industries.includes(industry) ? "chip active" : "chip"}
                  disabled={draft.industries.length <= 1 && draft.industries.includes(industry)}
                  onClick={() => toggleIndustry(industry)}
                  type="button"
                >
                  {industry}
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <h2>Business Units</h2>
            <div className="chips-wrap">
              {draft.businessUnits.map((unit, idx) => (
                <div className="pill" key={`${unit}-${idx}`}>
                  <span>{unit}</span>
                  <button
                    type="button"
                    disabled={draft.businessUnits.length <= 1}
                    onClick={() =>
                      updateDraft((current) => ({
                        ...current,
                        businessUnits: current.businessUnits.filter((_, itemIndex) => itemIndex !== idx)
                      }))
                    }
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
            <label>
              Add business unit
              <input
                placeholder="Type a business unit and press Enter"
                onKeyDown={(event) => {
                  if (event.key !== "Enter") {
                    return;
                  }

                  event.preventDefault();
                  const value = event.currentTarget.value.trim();
                  if (!value) {
                    return;
                  }

                  updateDraft((current) => ({
                    ...current,
                    businessUnits: [...current.businessUnits, value]
                  }));
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </div>

          <div className="card">
            <div className="row-between">
              <h2>Services Offered (for routing & calendars)</h2>
              <button type="button" className="primary-button" onClick={() => setIsJobTypeModalOpen(true)}>
                Select Job Types
              </button>
            </div>
            <div className="chips-wrap">
              {draft.services.map((service, idx) => (
                <div className="pill" key={`${service}-${idx}`}>
                  <span>{service}</span>
                  <button
                    type="button"
                    onClick={() =>
                      updateDraft((current) => ({
                        ...current,
                        services: current.services.filter((_, itemIndex) => itemIndex !== idx)
                      }))
                    }
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
            <label>
              Add service
              <input
                placeholder="Service name"
                onKeyDown={(event) => {
                  if (event.key !== "Enter") {
                    return;
                  }

                  event.preventDefault();
                  const value = event.currentTarget.value.trim();
                  if (!value) {
                    return;
                  }

                  updateDraft((current) => ({
                    ...current,
                    services: [...current.services, value]
                  }));
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </div>

          <div className="card">
            <div className="row-between">
              <h2>Calendar Routing</h2>
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  const route = createEmptyRoute(draft.services);
                  updateDraft((current) => ({
                    ...current,
                    calendarRoutes: [...current.calendarRoutes, route]
                  }));
                  setStatus(`Added calendar route: ${route.label}`);
                }}
              >
                + Add Calendar
              </button>
            </div>

            {draft.calendarRoutes.map((route, routeIndex) => {
              const zipText = route.area.zipCodes.join(", ");
              const polygonText = pointsToText(route.area.polygonPoints);

              return (
                <article className="route-card" key={route.id}>
                  <div className="grid-two">
                    <label>
                      Calendar Label
                      <input
                        value={route.label}
                        onChange={(event) =>
                          updateDraft((current) => {
                            const next = structuredClone(current);
                            next.calendarRoutes[routeIndex].label = event.target.value;
                            return next;
                          })
                        }
                      />
                    </label>
                    <label>
                      GHL Calendar ID
                      <input
                        value={route.ghlCalendarId}
                        onChange={(event) =>
                          updateDraft((current) => {
                            const next = structuredClone(current);
                            next.calendarRoutes[routeIndex].ghlCalendarId = event.target.value;
                            return next;
                          })
                        }
                      />
                    </label>
                  </div>

                  <div>
                    <span className="field-label">Services this calendar handles</span>
                    <div className="service-checkbox-grid">
                      {draft.services.map((service) => (
                        <label key={service} className="service-checkbox-row">
                          <input
                            type="checkbox"
                            checked={route.services.includes(service)}
                            disabled={route.services.length <= 1 && route.services.includes(service)}
                            onChange={() =>
                              updateDraft((current) => {
                                const next = structuredClone(current);
                                const svcs = next.calendarRoutes[routeIndex].services;
                                next.calendarRoutes[routeIndex].services = svcs.includes(service)
                                  ? svcs.filter((s) => s !== service)
                                  : [...svcs, service];
                                return next;
                              })
                            }
                          />
                          <span>{service}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="area-tabs">
                    {([
                      ["NONE", "None"],
                      ["ZIP_LIST", "ZIP list"],
                      ["GEOFENCE_MI", "Geofence (mi)"],
                      ["POLYGON", "Advanced (Polygon)"]
                    ] as Array<[AreaMode, string]>).map(([mode, label]) => (
                      <button
                        type="button"
                        key={mode}
                        className={route.area.mode === mode ? "chip active" : "chip"}
                        onClick={() => {
                          updateDraft((current) => {
                            const next = structuredClone(current);
                            next.calendarRoutes[routeIndex].area.mode = mode;
                            return next;
                          });
                          if (mode === "POLYGON") {
                            setPolygonRouteId(route.id);
                          }
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {route.area.mode === "ZIP_LIST" && (
                    <label>
                      ZIP Codes (comma or space separated)
                      <input
                        value={zipText}
                        onChange={(event) =>
                          updateDraft((current) => {
                            const next = structuredClone(current);
                            next.calendarRoutes[routeIndex].area.zipCodes = parseZipCodes(event.target.value);
                            return next;
                          })
                        }
                        placeholder="78701, 78702, 78703"
                      />
                    </label>
                  )}

                  {route.area.mode === "GEOFENCE_MI" && (
                    <div className="grid-three">
                      <label>
                        Center Lat
                        <input
                          type="number"
                          value={route.area.geofence?.centerLat ?? ""}
                          onChange={(event) =>
                            updateDraft((current) => {
                              const next = structuredClone(current);
                              next.calendarRoutes[routeIndex].area.geofence = {
                                centerLat: Number(event.target.value),
                                centerLng: next.calendarRoutes[routeIndex].area.geofence?.centerLng ?? 0,
                                radiusMi: next.calendarRoutes[routeIndex].area.geofence?.radiusMi ?? 10
                              };
                              return next;
                            })
                          }
                        />
                      </label>
                      <label>
                        Center Lng
                        <input
                          type="number"
                          value={route.area.geofence?.centerLng ?? ""}
                          onChange={(event) =>
                            updateDraft((current) => {
                              const next = structuredClone(current);
                              next.calendarRoutes[routeIndex].area.geofence = {
                                centerLat: next.calendarRoutes[routeIndex].area.geofence?.centerLat ?? 0,
                                centerLng: Number(event.target.value),
                                radiusMi: next.calendarRoutes[routeIndex].area.geofence?.radiusMi ?? 10
                              };
                              return next;
                            })
                          }
                        />
                      </label>
                      <label>
                        Radius (mi)
                        <input
                          type="number"
                          value={route.area.geofence?.radiusMi ?? ""}
                          onChange={(event) =>
                            updateDraft((current) => {
                              const next = structuredClone(current);
                              next.calendarRoutes[routeIndex].area.geofence = {
                                centerLat: next.calendarRoutes[routeIndex].area.geofence?.centerLat ?? 0,
                                centerLng: next.calendarRoutes[routeIndex].area.geofence?.centerLng ?? 0,
                                radiusMi: Number(event.target.value)
                              };
                              return next;
                            })
                          }
                        />
                      </label>
                    </div>
                  )}

                  {route.area.mode === "POLYGON" && (
                    <>
                      <label>
                        Polygon Points (one per line: lat,lng)
                        <textarea
                          rows={6}
                          value={polygonText}
                          onChange={(event) =>
                            updateDraft((current) => {
                              const next = structuredClone(current);
                              next.calendarRoutes[routeIndex].area.polygonPoints = parsePolygonPoints(event.target.value);
                              return next;
                            })
                          }
                        />
                      </label>
                      <div className="row-between">
                        <span className="subtle">Points parsed: {route.area.polygonPoints.length}</span>
                        <button type="button" className="ghost-button" onClick={() => setPolygonRouteId(route.id)}>
                          Draw on Map
                        </button>
                      </div>
                    </>
                  )}

                  {route.area.mode !== "POLYGON" && (
                    <div className="row-between">
                      <span className="subtle">Use polygon drawing when this calendar needs a custom service area.</span>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => {
                          updateDraft((current) => {
                            const next = structuredClone(current);
                            next.calendarRoutes[routeIndex].area.mode = "POLYGON";
                            return next;
                          });
                          setPolygonRouteId(route.id);
                        }}
                      >
                        Draw on Map
                      </button>
                    </div>
                  )}

                  <div className="row-right">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() =>
                        updateDraft((current) => {
                          const next = structuredClone(current);
                          next.calendarRoutes.push({
                            ...structuredClone(route),
                            id: crypto.randomUUID(),
                            label: `${route.label || "calendar"}-clone`
                          });
                          return next;
                        })
                      }
                    >
                      Clone
                    </button>
                    <button
                      type="button"
                      className="danger-button"
                      disabled={draft.calendarRoutes.length <= 1}
                      onClick={() =>
                        updateDraft((current) => ({
                          ...current,
                          calendarRoutes: current.calendarRoutes.filter((item) => item.id !== route.id)
                        }))
                      }
                    >
                      Remove
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="card">
            <h2>Custom Questions</h2>
            <div className="grid-two">
              {draft.customQuestions.map((question, idx) => (
                <label key={question.id}>
                  {`Question ${idx + 1}`}
                  <input
                    value={question.label}
                    onChange={(event) =>
                      updateDraft((current) => {
                        const next = structuredClone(current);
                        next.customQuestions[idx].label = event.target.value;
                        return next;
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="card">
            <h2>Fields Retell / n8n Will Populate (auto)</h2>
            <div className="field-grid">
              {draft.autoFields.map((field, idx) => (
                <div className="field-item" key={`${field.key}-${idx}`}>
                  <span>{field.label}</span>
                  <button
                    className={field.required ? "mini-tag required" : "mini-tag"}
                    onClick={() =>
                      updateDraft((current) => {
                        const next = structuredClone(current);
                        next.autoFields[idx].required = !next.autoFields[idx].required;
                        return next;
                      })
                    }
                    type="button"
                  >
                    {field.required ? "required" : "optional"}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h2>Context</h2>
            <div className="grid-two">
              <label>
                Connected CRM
                <select
                  value={draft.connectedCrm}
                  onChange={(event) => updateDraft((current) => ({ ...current, connectedCrm: event.target.value }))}
                >
                  {crmOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="card">
            <div className="row-between">
              <h2>Mappings</h2>
              <button
                type="button"
                className="primary-button"
                onClick={() =>
                  updateDraft((current) => ({
                    ...current,
                    stageMappings: [
                      ...current.stageMappings,
                      {
                        id: crypto.randomUUID(),
                        externalStage: "",
                        ghlStage: "",
                        enabled: true
                      }
                    ]
                  }))
                }
              >
                + Add Mapping
              </button>
            </div>

            <table className="mapping-table">
              <thead>
                <tr>
                  <th>{`${draft.connectedCrm} Stage`}</th>
                  <th>GHL Stage</th>
                  <th>On/Off</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {draft.stageMappings.map((mapping: StageMapping, idx) => (
                  <tr key={mapping.id}>
                    <td>
                      <input
                        value={mapping.externalStage}
                        onChange={(event) =>
                          updateDraft((current) => {
                            const next = structuredClone(current);
                            next.stageMappings[idx].externalStage = event.target.value;
                            return next;
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        value={mapping.ghlStage}
                        onChange={(event) =>
                          updateDraft((current) => {
                            const next = structuredClone(current);
                            next.stageMappings[idx].ghlStage = event.target.value;
                            return next;
                          })
                        }
                      />
                    </td>
                    <td>
                      <button
                        className={mapping.enabled ? "toggle on" : "toggle"}
                        type="button"
                        onClick={() =>
                          updateDraft((current) => {
                            const next = structuredClone(current);
                            next.stageMappings[idx].enabled = !next.stageMappings[idx].enabled;
                            return next;
                          })
                        }
                      >
                        {mapping.enabled ? "ON" : "OFF"}
                      </button>
                    </td>
                    <td>
                      <button
                        className="ghost-button"
                        type="button"
                        disabled={draft.stageMappings.length <= 1}
                        onClick={() =>
                          updateDraft((current) => ({
                            ...current,
                            stageMappings: current.stageMappings.filter((row) => row.id !== mapping.id)
                          }))
                        }
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2>Route Preview Test</h2>
            <div className="grid-five">
              <label>
                Service
                <input
                  value={routeInput.service}
                  onChange={(event) => setRouteInput((prev) => ({ ...prev, service: event.target.value }))}
                />
              </label>
              <label>
                ZIP
                <input value={routeInput.zip} onChange={(event) => setRouteInput((prev) => ({ ...prev, zip: event.target.value }))} />
              </label>
              <label>
                Lat
                <input value={routeInput.lat} onChange={(event) => setRouteInput((prev) => ({ ...prev, lat: event.target.value }))} />
              </label>
              <label>
                Lng
                <input value={routeInput.lng} onChange={(event) => setRouteInput((prev) => ({ ...prev, lng: event.target.value }))} />
              </label>
              <label>
                Stage
                <input
                  value={routeInput.stage}
                  onChange={(event) => setRouteInput((prev) => ({ ...prev, stage: event.target.value }))}
                />
              </label>
            </div>
            <div className="row-between">
              <button className="primary-button" type="button" onClick={handleRoutePreview} disabled={routeLoading}>
                {routeLoading ? "Checking..." : "Preview Route"}
              </button>
            </div>
            {routeResult ? (
              <div className={`route-result-card ${routeResult.matched ? "matched" : "no-match"}`}>
                <strong className="route-result-status">{routeResult.matched ? "MATCHED" : "NO MATCH"}</strong>
                <dl className="route-result-details">
                  <div><dt>Calendar</dt><dd>{routeResult.calendar}</dd></div>
                  <div><dt>Reason</dt><dd>{routeResult.reason}</dd></div>
                  <div><dt>Plugin</dt><dd>{routeResult.pluginEnabled ? "Enabled" : "Disabled"}</dd></div>
                </dl>
              </div>
            ) : (
              <p className="subtle">Run a route preview to validate service + area mapping.</p>
            )}
          </div>
        </section>

        <aside className="right-column">
          <div className="card sticky preview-card">
            <h2>Multiply Talents Config Preview</h2>
            <p className="subtle">Tweak options on the left. Save to write to middleware storage.</p>

            <div className="stage-pills">
              {stageOptions.map((stage) => (
                <span key={stage} className="pill-plain">
                  {stage}
                </span>
              ))}
            </div>

            <dl className="preview-list">
              <div>
                <dt>Client</dt>
                <dd>
                  {draft.clientName} | {draft.slug}
                </dd>
              </div>
              <div>
                <dt>CRM</dt>
                <dd>{draft.connectedCrm}</dd>
              </div>
              <div>
                <dt>Timezone</dt>
                <dd>{draft.timezone}</dd>
              </div>
              <div>
                <dt>Industries</dt>
                <dd>{draft.industries.join(", ") || "-"}</dd>
              </div>
              <div>
                <dt>Services</dt>
                <dd>{draft.services.length} selected</dd>
              </div>
              <div>
                <dt>Calendars</dt>
                <dd>{draft.calendarRoutes.length}</dd>
              </div>
              <div>
                <dt>Business Units</dt>
                <dd>{draft.businessUnits.join(", ") || "-"}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{new Date(draft.updatedAt).toLocaleString()}</dd>
              </div>
            </dl>

            <details>
              <summary>Preview JSON</summary>
              <pre>{JSON.stringify(draft, null, 2)}</pre>
            </details>
          </div>

          <div className="card plugins-card">
            <h2>Plugins (per GHL stage)</h2>
            <p className="subtle">Toggle which automation plugins are active.</p>
            <div className="plugin-list">
              {Array.from(new Set([...pluginDefaults, ...Object.keys(draft.pluginToggles)])).map((plugin) => (
                <button
                  key={plugin}
                  className={draft.pluginToggles[plugin] ? "toggle-row on" : "toggle-row"}
                  type="button"
                  onClick={() =>
                    updateDraft((current) => ({
                      ...current,
                      pluginToggles: {
                        ...current.pluginToggles,
                        [plugin]: !current.pluginToggles[plugin]
                      }
                    }))
                  }
                >
                  <span>{plugin}</span>
                  <span>{draft.pluginToggles[plugin] ? "ON" : "OFF"}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="card events-card">
            <h2>Recent Events</h2>
            <button
              type="button"
              className="ghost-button"
              onClick={async () => {
                try {
                  const logs = await fetchEvents(40);
                  setEvents(logs);
                } catch (error) {
                  setStatus(error instanceof Error ? error.message : "Failed to refresh events");
                }
              }}
            >
              Refresh
            </button>
            <div className="event-list">
              {events.map((event) => (
                <article key={event.id} className="event-row">
                  <strong>{event.eventType.toUpperCase()}</strong>
                  <span className={`status ${event.status}`}>{event.status}</span>
                  <small>{new Date(event.receivedAt).toLocaleString()}</small>
                </article>
              ))}
            </div>
          </div>
        </aside>
      </main>

      <footer className={`status-bar${statusClass ? ` ${statusClass}` : ""}`}>{status || "Ready"}</footer>

      {isJobTypeModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <header className="modal-header">
              <div>
                <h3>Job Types</h3>
                <p>Select one or more job types to add to your Services list.</p>
              </div>
              <button type="button" className="primary-button" onClick={applyJobTypesToServices}>
                Done
              </button>
            </header>

            <div className="modal-tabs">
              <button
                type="button"
                className={jobTypeSource === "crm" ? "chip active" : "chip"}
                onClick={() => setJobTypeSource("crm")}
              >
                Use CRM ({draft.connectedCrm})
              </button>
              <button
                type="button"
                className={jobTypeSource === "manual" ? "chip active" : "chip"}
                onClick={() => setJobTypeSource("manual")}
              >
                Manual
              </button>
            </div>

            <div className="modal-search-row">
              <input
                value={jobTypeQuery}
                onChange={(event) => setJobTypeQuery(event.target.value)}
                placeholder={jobTypeSource === "crm" ? "Search CRM job types..." : "Search manual list..."}
              />
              <span>{jobTypeSelected.length} selected</span>
            </div>

            <div className="modal-grid">
              {filteredJobTypes.map((jobType) => (
                <label key={jobType} className="jobtype-row">
                  <input type="checkbox" checked={jobTypeSelected.includes(jobType)} onChange={() => toggleJobType(jobType)} />
                  <span>{jobType}</span>
                </label>
              ))}
            </div>

            <div className="row-right">
              <button type="button" className="ghost-button" onClick={() => setIsJobTypeModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedPolygonRoute && (
        <PolygonMapModal
          title={`Draw Service Area - ${selectedPolygonRoute.label || "Calendar Route"}`}
          initialPoints={selectedPolygonRoute.area.polygonPoints}
          onClose={() => setPolygonRouteId(null)}
          onUseArea={(points) => {
            updateDraft((current) => {
              const next = structuredClone(current);
              const index = next.calendarRoutes.findIndex((route) => route.id === selectedPolygonRoute.id);
              if (index >= 0) {
                next.calendarRoutes[index].area.mode = "POLYGON";
                next.calendarRoutes[index].area.polygonPoints = points;
              }
              return next;
            });
            setPolygonRouteId(null);
            setStatus(`Polygon updated with ${points.length} points`);
          }}
        />
      )}
    </div>
  );
}

export default App;
