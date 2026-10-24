"use client";

import { useState } from "react";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronRight,
  Code2,
  Compass,
  Database,
  ExternalLink,
  FileText,
  Globe,
  Landmark,
  Layers,
  MapPin,
  PhoneCall,
  Search,
  Shield,
  ShieldAlert,
  Sparkles,
  TreePine,
  Workflow,
  Zap,
} from "lucide-react";
import {
  BORDER_DISPUTE_THRESHOLD_METRES,
  DATAMEET_PCMC_ZONES,
  DATAMEET_PMC_ADMIN_WARDS,
  DEFAULT_OVERPASS_ENDPOINT,
  HAAD_DIFFERENCE_MATRIX,
  buildOverpassBoundaryQuery,
  executeOverpassQuery,
  resolveJurisdiction,
  type Coordinates,
  type HaadDifferenceCategory,
  type OverpassExecutionResult,
  type OverpassQueryType,
} from "@effi/domain";
import { OfficerShell } from "./officer-shell";
import { JurisdictionMap } from "./jurisdiction-map";

// Preset landmarks across Pune and PCMC metropolitan area
const PRESET_LOCATIONS: readonly {
  name: string;
  marathi: string;
  coords: Coordinates;
  authority: "PCMC" | "PMC" | "GRAMPANCHAYAT" | "CANTONMENT";
  badge: string;
}[] = [
  {
    name: "Wakad, Dange Chowk",
    marathi: "वाकड (पिंपरी चिंचवड)",
    coords: { latitude: 18.598, longitude: 73.763 },
    authority: "PCMC",
    badge: "PCMC Zone D",
  },
  {
    name: "Aundh, DP Road",
    marathi: "औंध (पुणे मनपा)",
    coords: { latitude: 18.558, longitude: 73.807 },
    authority: "PMC",
    badge: "PMC Aundh Ward",
  },
  {
    name: "Hinjawadi Phase 1",
    marathi: "हिंजवडी टप्पा १ (ग्रामपंचायत)",
    coords: { latitude: 18.591, longitude: 73.738 },
    authority: "GRAMPANCHAYAT",
    badge: "Grampanchayat (PMRDA)",
  },
  {
    name: "Harris Bridge Border",
    marathi: "हॅरिस ब्रिज (दापोडी-बोपोडी सीमा)",
    coords: { latitude: 18.577, longitude: 73.826 },
    authority: "PCMC",
    badge: "PCMC-PMC Collision Border",
  },
  {
    name: "Bhumkar Chowk Border",
    marathi: "भुमकर चौक (वाकड-हिंजवडी सीमा)",
    coords: { latitude: 18.597, longitude: 73.754 },
    authority: "PCMC",
    badge: "PCMC vs GP Buffer",
  },
  {
    name: "Khadki Cantonment Bazar",
    marathi: "खडकी कटक मंडळ",
    coords: { latitude: 18.563, longitude: 73.839 },
    authority: "CANTONMENT",
    badge: "Defence Enclave",
  },
  {
    name: "Wagholi Town Center",
    marathi: "वाघोली (मनपा समाविष्ट २०२१)",
    coords: { latitude: 18.581, longitude: 73.980 },
    authority: "PMC",
    badge: "PMC Merged Village",
  },
  {
    name: "Moshi, Alandi Road",
    marathi: "मोशी (पिंपरी चिंचवड)",
    coords: { latitude: 18.675, longitude: 73.845 },
    authority: "PCMC",
    badge: "PCMC Zone C",
  },
  {
    name: "Kothrud, Paud Road",
    marathi: "कोथरूड (पुणे मनपा)",
    coords: { latitude: 18.507, longitude: 73.807 },
    authority: "PMC",
    badge: "PMC Kothrud Ward",
  },
  {
    name: "Gahunje MCA Stadium",
    marathi: "गहुंजे (ग्रामपंचायत)",
    coords: { latitude: 18.672, longitude: 73.705 },
    authority: "GRAMPANCHAYAT",
    badge: "Grampanchayat (Mawal)",
  },
];

export function JurisdictionPage() {
  const [coords, setCoords] = useState<Coordinates>({
    latitude: 18.598,
    longitude: 73.763,
  });
  const [latInput, setLatInput] = useState("18.598");
  const [lngInput, setLngInput] = useState("73.763");
  const [activeCategory, setActiveCategory] = useState<HaadDifferenceCategory>("governance");

  const [wardSearchQuery, setWardSearchQuery] = useState("");
  const [directoryTab, setDirectoryTab] = useState<"pmc" | "pcmc">("pmc");

  // Overpass Interpreter State
  const [overpassQueryType, setOverpassQueryType] = useState<OverpassQueryType>("pcmc_boundary");
  const [overpassQueryText, setOverpassQueryText] = useState(buildOverpassBoundaryQuery("pcmc_boundary"));
  const [overpassResult, setOverpassResult] = useState<OverpassExecutionResult | null>(null);
  const [overpassLoading, setOverpassLoading] = useState(false);
  const [showOverpassWorkbench, setShowOverpassWorkbench] = useState(false);

  // Compute live resolution
  const resolution = resolveJurisdiction(coords);

  const handleApplyCoordinates = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const lat = parseFloat(latInput);
    const lng = parseFloat(lngInput);
    if (!Number.isNaN(lat) && !Number.isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      setCoords({ latitude: lat, longitude: lng });
    }
  };

  const handleSelectPreset = (preset: (typeof PRESET_LOCATIONS)[number]) => {
    setCoords(preset.coords);
    setLatInput(preset.coords.latitude.toString());
    setLngInput(preset.coords.longitude.toString());
  };

  const handleCoordinatesChangeFromMap = (newCoords: Coordinates) => {
    setCoords(newCoords);
    setLatInput(newCoords.latitude.toString());
    setLngInput(newCoords.longitude.toString());
  };

  const handleLocateWard = (lat: number, lon: number) => {
    setCoords({ latitude: lat, longitude: lon });
    setLatInput(lat.toString());
    setLngInput(lon.toString());
    window.scrollTo({ top: 400, behavior: "smooth" });
  };

  const handleRunOverpassQuery = async () => {
    setOverpassLoading(true);
    try {
      const result = await executeOverpassQuery(overpassQueryText, DEFAULT_OVERPASS_ENDPOINT);
      setOverpassResult(result);
    } catch {
      // Handled inside executeOverpassQuery
    } finally {
      setOverpassLoading(false);
    }
  };

  const handleQueryTypeChange = (type: OverpassQueryType) => {
    setOverpassQueryType(type);
    setOverpassQueryText(buildOverpassBoundaryQuery(type));
  };

  const fallbackDifference = HAAD_DIFFERENCE_MATRIX[0]!;
  const selectedDifference = HAAD_DIFFERENCE_MATRIX.find((d) => d.category === activeCategory) ?? fallbackDifference;

  const filteredPmcWards = DATAMEET_PMC_ADMIN_WARDS.filter((ward) => {
    if (!wardSearchQuery.trim()) return true;
    const q = wardSearchQuery.toLowerCase();
    return (
      ward.name.toLowerCase().includes(q) ||
      ward.nameMarathi.includes(q) ||
      ward.address.toLowerCase().includes(q) ||
      ward.areasCovered.some((a) => a.toLowerCase().includes(q))
    );
  });

  const filteredPcmcZones = DATAMEET_PCMC_ZONES.filter((zone) => {
    if (!wardSearchQuery.trim()) return true;
    const q = wardSearchQuery.toLowerCase();
    return (
      zone.name.toLowerCase().includes(q) ||
      zone.nameMarathi.includes(q) ||
      zone.headquarters.toLowerCase().includes(q) ||
      zone.zoneKey.toLowerCase().includes(q)
    );
  });

  return (
    <OfficerShell activeNav="jurisdiction">
      <div className="space-y-6 pt-4 sm:pt-6">
        {/* Page Header */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded bg-action/10 px-2.5 py-0.5 text-xs font-bold text-action">
                <Sparkles className="size-3" />
                Geospatial Boundary Engine
              </span>
              <span className="text-xs text-muted">MMCA 1949 / MVPA 1959 / PMRDA</span>
            </div>
            <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
              PCMC vs PMC Geospatial Haad &amp; Jurisdiction Inspector
            </h1>
            <p className="mt-1 text-sm text-graphite">
              महानगरपालिका हद्द (Corporation Limits) विरुद्ध ग्रामपंचायत फरक, अचूक अक्षांश-रेखांश विश्लेषण आणि अधिकार क्षेत्र पडताळणी.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowOverpassWorkbench(!showOverpassWorkbench)}
              type="button"
              className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-semibold shadow-sm transition-colors ${
                showOverpassWorkbench
                  ? "border-action bg-action text-white"
                  : "border-line bg-surface text-ink hover:bg-fog"
              }`}
            >
              <Code2 className="size-4" />
              <span>Overpass Interpreter API</span>
            </button>
          </div>
        </div>

        {/* DataMeet Dataset Provenance Banner */}
        <div className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50/80 via-surface to-emerald-50/60 p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800">
                  <Database className="size-3 text-blue-600" />
                  DataMeet Open Data Integration
                </span>
                <span className="text-xs text-muted">Repo: datameet/Pune_wards</span>
              </div>
              <h2 className="text-sm sm:text-base font-bold text-ink">
                Verified Boundaries: 15 PMC Administrative Wards &amp; PCMC Electoral Zones A–F
              </h2>
              <p className="text-xs text-graphite max-w-3xl leading-relaxed">
                Zone boundaries, administrative polygons, and ward office geolocations have been integrated directly from{" "}
                <a
                  href="https://github.com/datameet/Pune_wards"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-action underline hover:text-action-hover inline-flex items-center gap-1"
                >
                  <span>github.com/datameet/Pune_wards</span>
                  <ExternalLink className="size-3" />
                </a>
                . Licensed under Creative Commons Attribution-ShareAlike 2.5 India (DataMeet Trust Pune).
              </p>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <div className="rounded-lg border border-blue-200/80 bg-white/80 px-3 py-1.5 shadow-xs">
                <span className="block text-[10px] uppercase font-bold text-muted">PMC Admin Wards</span>
                <span className="font-bold text-blue-700">15 Field Offices</span>
              </div>
              <div className="rounded-lg border border-emerald-200/80 bg-white/80 px-3 py-1.5 shadow-xs">
                <span className="block text-[10px] uppercase font-bold text-muted">PCMC Electoral</span>
                <span className="font-bold text-emerald-700">66 Polygons (6 Zones)</span>
              </div>
              <div className="rounded-lg border border-line bg-white/80 px-3 py-1.5 shadow-xs">
                <span className="block text-[10px] uppercase font-bold text-muted">Electoral Total</span>
                <span className="font-bold text-ink">144 Pune Wards</span>
              </div>
            </div>
          </div>
        </div>

        {/* Live Coordinate Input & Preset Bar */}
        <div className="rounded-xl border border-line bg-surface p-4 shadow-sm sm:p-5">
          <form onSubmit={handleApplyCoordinates} className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="latitude" className="block text-xs font-bold uppercase tracking-wider text-muted">
                  Latitude (अक्षांश)
                </label>
                <div className="relative mt-1">
                  <input
                    id="latitude"
                    type="number"
                    step="any"
                    value={latInput}
                    onChange={(e) => setLatInput(e.target.value)}
                    className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm font-mono text-ink shadow-sm transition-colors focus:border-action focus:outline-none"
                    placeholder="18.598"
                  />
                  <Compass className="pointer-events-none absolute right-3 top-2.5 size-4 text-muted" />
                </div>
              </div>

              <div>
                <label htmlFor="longitude" className="block text-xs font-bold uppercase tracking-wider text-muted">
                  Longitude (रेखांश)
                </label>
                <div className="relative mt-1">
                  <input
                    id="longitude"
                    type="number"
                    step="any"
                    value={lngInput}
                    onChange={(e) => setLngInput(e.target.value)}
                    className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm font-mono text-ink shadow-sm transition-colors focus:border-action focus:outline-none"
                    placeholder="73.763"
                  />
                  <Compass className="pointer-events-none absolute right-3 top-2.5 size-4 text-muted" />
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-action px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-action-hover focus-visible:outline-2 active:scale-[0.98]"
            >
              <Search className="size-4" />
              <span>Inspect Coordinates</span>
            </button>
          </form>

          {/* Quick Preset Location Chips */}
          <div className="mt-4 border-t border-line/60 pt-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Quick Landmark Presets:</span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PRESET_LOCATIONS.map((preset) => {
                const isSelected =
                  Math.abs(coords.latitude - preset.coords.latitude) < 0.001 &&
                  Math.abs(coords.longitude - preset.coords.longitude) < 0.001;
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      isSelected
                        ? "border-action bg-action/10 font-semibold text-action"
                        : "border-line bg-canvas text-graphite hover:border-action/40 hover:text-ink"
                    }`}
                  >
                    <span
                      className={`size-1.5 rounded-full ${
                        preset.authority === "PCMC"
                          ? "bg-emerald-600"
                          : preset.authority === "PMC"
                            ? "bg-blue-600"
                            : preset.authority === "GRAMPANCHAYAT"
                              ? "bg-amber-600"
                              : "bg-purple-600"
                      }`}
                    />
                    <span>{preset.name}</span>
                    <span className="text-[10px] text-muted">({preset.badge})</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Overpass Interpreter Workbench (Collapsible) */}
        {showOverpassWorkbench ? (
          <div className="rounded-xl border border-action/30 bg-action/5 p-4 sm:p-5 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-action/20 pb-3">
              <div>
                <h3 className="flex items-center gap-2 text-base font-bold text-ink">
                  <Code2 className="size-4 text-action" />
                  <span>OpenStreetMap Overpass Interpreter API Workbench</span>
                </h3>
                <p className="text-xs text-graphite">
                  Target Endpoint: <code className="font-mono text-action">{DEFAULT_OVERPASS_ENDPOINT}</code>
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => handleQueryTypeChange("pcmc_boundary")}
                  className={`rounded px-2.5 py-1 text-xs font-semibold ${
                    overpassQueryType === "pcmc_boundary" ? "bg-action text-white" : "bg-surface text-ink hover:bg-fog"
                  }`}
                >
                  PCMC Boundary
                </button>
                <button
                  type="button"
                  onClick={() => handleQueryTypeChange("pmc_boundary")}
                  className={`rounded px-2.5 py-1 text-xs font-semibold ${
                    overpassQueryType === "pmc_boundary" ? "bg-action text-white" : "bg-surface text-ink hover:bg-fog"
                  }`}
                >
                  PMC Boundary
                </button>
                <button
                  type="button"
                  onClick={() => handleQueryTypeChange("talukas_boundaries")}
                  className={`rounded px-2.5 py-1 text-xs font-semibold ${
                    overpassQueryType === "talukas_boundaries" ? "bg-action text-white" : "bg-surface text-ink hover:bg-fog"
                  }`}
                >
                  Haveli / Mulshi Talukas
                </button>
              </div>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-muted uppercase">Overpass QL Query</label>
                <textarea
                  rows={6}
                  value={overpassQueryText}
                  onChange={(e) => setOverpassQueryText(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-canvas p-2.5 font-mono text-xs text-ink shadow-inner focus:outline-none focus:border-action"
                />
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[11px] text-muted">POST request with application/x-www-form-urlencoded</span>
                  <button
                    type="button"
                    disabled={overpassLoading}
                    onClick={handleRunOverpassQuery}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-action px-4 py-1.5 text-xs font-bold text-white shadow transition-colors hover:bg-action-hover disabled:opacity-50"
                  >
                    {overpassLoading ? (
                      <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <Zap className="size-3.5" />
                    )}
                    <span>{overpassLoading ? "Querying..." : "Run Overpass Query"}</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-muted uppercase">Interpreter API Response</label>
                <div className="mt-1 h-[142px] overflow-auto rounded-lg border border-line bg-canvas p-2.5 font-mono text-[11px] text-ink">
                  {overpassResult ? (
                    <div>
                      <div className="flex items-center justify-between border-b border-line pb-1 mb-1 text-[10px]">
                        <span className={overpassResult.isBundledFallback ? "text-amber-600 font-bold" : "text-emerald-600 font-bold"}>
                          {overpassResult.isBundledFallback ? "✓ Active (Local GIS Fallback)" : "✓ Overpass Live HTTP 200"}
                        </span>
                        <span className="text-muted">{overpassResult.responseTimeMs} ms | {overpassResult.elementCount} elements</span>
                      </div>
                      <pre>{JSON.stringify(overpassResult.data, null, 2)}</pre>
                    </div>
                  ) : (
                    <div className="grid h-full place-items-center text-center text-muted">
                      <p>Click &ldquo;Run Overpass Query&rdquo; to fetch live boundary relations from Overpass interpreter API.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Main Geospatial Inspection Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Interactive Map (7 cols) */}
          <div className="lg:col-span-7">
            <div className="h-[620px]">
              <JurisdictionMap
                activeCoordinates={coords}
                resolution={resolution}
                onCoordinatesChange={handleCoordinatesChangeFromMap}
              />
            </div>
            <p className="mt-2 text-xs text-graphite flex items-center gap-1.5">
              <Compass className="size-3.5 text-muted shrink-0" />
              <span>
                Tip: Click anywhere on the map or drag the inspection pin to check instant jurisdiction distinction.
              </span>
            </p>
          </div>

          {/* Real-Time Jurisdiction Resolution Card (5 cols) */}
          <div className="space-y-4 lg:col-span-5">
            <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-muted">Resolution Result</span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold text-white shadow-sm ${
                    resolution.authority === "PCMC"
                      ? "bg-emerald-600"
                      : resolution.authority === "PMC"
                        ? "bg-blue-600"
                        : resolution.authority === "GRAMPANCHAYAT"
                          ? "bg-amber-600"
                          : "bg-purple-600"
                  }`}
                >
                  <Shield className="size-3.5" />
                  {resolution.authority}
                </span>
              </div>

              {/* Authority & Classification Title */}
              <div className="mt-4">
                <span className="text-xs font-semibold text-graphite">{resolution.classificationMarathi}</span>
                <h2 className="mt-0.5 font-display text-xl font-bold text-ink sm:text-2xl">
                  {resolution.authorityFullName}
                </h2>
                <p className="mt-1 text-sm font-medium text-action flex items-center gap-1.5">
                  <MapPin className="size-4 shrink-0" />
                  <span>{resolution.detectedZoneOrPanchayat}</span>
                </p>
              </div>

              {/* Mahanagarpalika Haad Status Banner */}
              <div
                className={`mt-4 flex items-center justify-between rounded-lg p-3 text-xs font-bold ${
                  resolution.inMahanagarpalikaHaad
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-amber-50 text-amber-800 border border-amber-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  {resolution.inMahanagarpalikaHaad ? (
                    <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="size-4 text-amber-600 shrink-0" />
                  )}
                  <span>
                    {resolution.inMahanagarpalikaHaad
                      ? "Within Official Mahanagarpalika Haad (महानगरपालिका हद्दीत)"
                      : "Outside Mahanagarpalika Haad (ग्रामपंचायत / पीएमआरडीए)"}
                  </span>
                </div>
                <span className="text-[10px] uppercase tracking-wider underline">
                  {resolution.inMahanagarpalikaHaad ? "MMCA 1949" : "MVPA 1959"}
                </span>
              </div>

              {/* Borderland Buffer Collision Warning */}
              {resolution.isBorderlandBuffer ? (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs text-red-900 shadow-sm">
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="size-4 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-bold text-red-800">
                        Boundary Dispute Zone (&lt; {BORDER_DISPUTE_THRESHOLD_METRES}m from Divide)
                      </strong>
                      <p className="mt-1 text-red-800/90 leading-relaxed">
                        {resolution.jointResolutionProtocol ??
                          "This ticket is in the borderland buffer. Under MMCA Sec 67, officers are strictly barred from closing tickets with 'Not in our jurisdiction'."}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Distance to Nearest Boundary */}
              <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-fog/70 p-3 text-xs">
                <div>
                  <span className="text-muted block text-[11px]">Distance to Boundary</span>
                  <strong className="text-sm font-bold text-ink">{resolution.distanceToNearestBoundaryMetres} metres</strong>
                </div>
                <div>
                  <span className="text-muted block text-[11px]">Nearest Divide</span>
                  <span className="font-semibold text-ink line-clamp-1" title={resolution.nearestBoundaryName}>
                    {resolution.nearestBoundaryName}
                  </span>
                </div>
              </div>

              {/* Administrative Specifications */}
              <dl className="mt-4 space-y-2.5 text-xs divide-y divide-line/60">
                <div className="pt-2 flex items-center justify-between">
                  <dt className="text-muted">Governing Statute:</dt>
                  <dd className="font-medium text-ink">{resolution.governingAct}</dd>
                </div>
                <div className="pt-2 flex items-center justify-between">
                  <dt className="text-muted">Planning Authority:</dt>
                  <dd className="font-medium text-ink">{resolution.planningAuthority}</dd>
                </div>
                <div className="pt-2 flex items-center justify-between">
                  <dt className="text-muted">Property Tax System:</dt>
                  <dd className="font-medium text-ink">{resolution.propertyTaxSystem}</dd>
                </div>
                <div className="pt-2 flex items-center justify-between">
                  <dt className="text-muted">Grievance Portal:</dt>
                  <dd className="font-medium text-action flex items-center gap-1">
                    <a href={resolution.portalUrl} target="_blank" rel="noreferrer" className="underline hover:text-action-hover">
                      {resolution.grievanceRedressalSystem}
                    </a>
                    <ExternalLink className="size-3" />
                  </dd>
                </div>
                <div className="pt-2 flex items-center justify-between">
                  <dt className="text-muted">Officer / Helpline Contact:</dt>
                  <dd className="font-bold text-ink flex items-center gap-1">
                    <PhoneCall className="size-3.5 text-emerald-600" />
                    <span>{resolution.grievanceHelpline}</span>
                  </dd>
                </div>
              </dl>

              {/* Field Officer Dispute Guidelines */}
              <div className="mt-4 border-t border-line pt-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Officer Handling Guidelines:</span>
                <ul className="mt-1.5 space-y-1 text-xs text-graphite list-disc list-inside">
                  {resolution.disputeResolutionGuidelines.map((guide, i) => (
                    <li key={i}>{guide}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Mahanagarpalika Haad vs Grampanchayat Comprehensive Comparison Section */}
        <div className="rounded-xl border border-line bg-surface p-5 shadow-sm sm:p-6">
          <div className="border-b border-line pb-4">
            <span className="inline-flex items-center gap-1 rounded bg-lavender px-2 py-0.5 text-xs font-bold text-ink">
              <Landmark className="size-3" />
              Civic Knowledge Matrix
            </span>
            <h2 className="mt-2 font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
              Mahanagarpalika Haad vs Grampanchayat: Core Differences
            </h2>
            <p className="mt-1 text-sm text-graphite">
              पुणे/पिंपरी चिंचवड महानगरपालिका हद्द आणि लगतच्या ग्रामपंचायती (उदा. हिंजवडी, मारुंजी, माण) यांच्यातील प्रशासकीय, कर आकारणी व नागरी सुविधांमधील फरक.
            </p>
          </div>

          {/* Category Tabs */}
          <div className="mt-4 flex flex-wrap gap-2 border-b border-line pb-3">
            {HAAD_DIFFERENCE_MATRIX.map((item) => (
              <button
                key={item.category}
                type="button"
                onClick={() => setActiveCategory(item.category)}
                className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold transition-colors ${
                  activeCategory === item.category
                    ? "bg-ink text-white shadow-sm"
                    : "bg-fog text-graphite hover:bg-lavender/60 hover:text-ink"
                }`}
              >
                {item.category === "governance" && <Landmark className="size-3.5" />}
                {item.category === "property_tax" && <FileText className="size-3.5" />}
                {item.category === "building_permission" && <Building2 className="size-3.5" />}
                {item.category === "water_supply" && <Compass className="size-3.5" />}
                {item.category === "waste_management" && <TreePine className="size-3.5" />}
                {item.category === "grievance_redressal" && <Workflow className="size-3.5" />}
                <span>{item.topic}</span>
              </button>
            ))}
          </div>

          {/* Active Comparison Content */}
          <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Mahanagarpalika Haad Card */}
            <div className="rounded-xl border-2 border-emerald-500/20 bg-emerald-50/30 p-5">
              <div className="flex items-center justify-between border-b border-emerald-500/20 pb-3">
                <div className="flex items-center gap-2">
                  <div className="grid size-8 place-items-center rounded-lg bg-emerald-600 text-white font-bold text-xs">
                    मनपा
                  </div>
                  <div>
                    <h3 className="font-display text-base font-bold text-emerald-950">
                      Mahanagarpalika Haad (महानगरपालिका हद्द)
                    </h3>
                    <span className="text-[11px] font-semibold text-emerald-700">PMC / PCMC Jurisdiction</span>
                  </div>
                </div>
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  {selectedDifference.mahanagarpalikaHaad.governingSection}
                </span>
              </div>

              <h4 className="mt-3 font-bold text-emerald-900">{selectedDifference.mahanagarpalikaHaad.title}</h4>
              <p className="mt-1 text-xs leading-relaxed text-emerald-900/80">
                {selectedDifference.mahanagarpalikaHaad.description}
              </p>

              <div className="mt-4 space-y-1.5 border-t border-emerald-500/10 pt-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">Key Features:</span>
                <ul className="space-y-1 text-xs text-emerald-900 list-disc list-inside">
                  {selectedDifference.mahanagarpalikaHaad.keyPoints.map((point, idx) => (
                    <li key={idx}>{point}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Grampanchayat Card */}
            <div className="rounded-xl border-2 border-amber-500/20 bg-amber-50/30 p-5">
              <div className="flex items-center justify-between border-b border-amber-500/20 pb-3">
                <div className="flex items-center gap-2">
                  <div className="grid size-8 place-items-center rounded-lg bg-amber-600 text-white font-bold text-xs">
                    ग्रा.पं
                  </div>
                  <div>
                    <h3 className="font-display text-base font-bold text-amber-950">
                      Grampanchayat (ग्रामपंचायत हद्द)
                    </h3>
                    <span className="text-[11px] font-semibold text-amber-700">PMRDA / Rural Local Body</span>
                  </div>
                </div>
                <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                  {selectedDifference.grampanchayat.governingSection}
                </span>
              </div>

              <h4 className="mt-3 font-bold text-amber-900">{selectedDifference.grampanchayat.title}</h4>
              <p className="mt-1 text-xs leading-relaxed text-amber-900/80">
                {selectedDifference.grampanchayat.description}
              </p>

              <div className="mt-4 space-y-1.5 border-t border-amber-500/10 pt-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">Key Features:</span>
                <ul className="space-y-1 text-xs text-amber-900 list-disc list-inside">
                  {selectedDifference.grampanchayat.keyPoints.map((point, idx) => (
                    <li key={idx}>{point}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Practical Citizen Impact & Officer Action Callout */}
          <div className="mt-5 grid grid-cols-1 gap-4 rounded-xl border border-line bg-fog/50 p-4 sm:grid-cols-2">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Practical Impact on Citizens:</span>
              <p className="mt-1 text-xs leading-relaxed text-ink font-medium">
                {selectedDifference.practicalImpactOnCitizen}
              </p>
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Field Officer Directive:</span>
              <p className="mt-1 text-xs leading-relaxed text-ink font-medium">
                {selectedDifference.recommendedOfficerAction}
              </p>
            </div>
          </div>
        </div>

        {/* Dispute Resolution Protocol Reference Card */}
        <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Workflow className="size-5 text-action" />
            <h3 className="font-display text-base font-bold text-ink">
              Section 67 MMCA: Boundary Dispute & Inter-Agency Coordination Protocol
            </h3>
          </div>
          <p className="mt-1 text-xs text-graphite">
            Follow these 4 statutory steps whenever a civic ticket is reported near the PCMC-PMC border (e.g. Mula river bridges, Dapodi, Bopodi) or PCMC-Hinjawadi highway corridor:
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-line bg-canvas p-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-action">
                <span>01</span>
                <ChevronRight className="size-3" />
                <span>Geotag Verification</span>
              </div>
              <p className="mt-1 text-xs text-graphite">
                Run coordinates through Effi&apos;s boundary engine. If within 350m of boundary line, flag ticket with &ldquo;Border Buffer&rdquo;.
              </p>
            </div>

            <div className="rounded-lg border border-line bg-canvas p-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-action">
                <span>02</span>
                <ChevronRight className="size-3" />
                <span>No Jurisdiction Rejection</span>
              </div>
              <p className="mt-1 text-xs text-graphite">
                Field officers must NOT reject complaint with &ldquo;Not in our jurisdiction (आमच्या हद्दीत येत नाही)&rdquo;.
              </p>
            </div>

            <div className="rounded-lg border border-line bg-canvas p-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-action">
                <span>03</span>
                <ChevronRight className="size-3" />
                <span>Dual Desk Alert</span>
              </div>
              <p className="mt-1 text-xs text-graphite">
                Effi auto-notifies both PCMC SARATHI and PMC CARE or PMRDA Liaison Officer for joint inspection.
              </p>
            </div>

            <div className="rounded-lg border border-line bg-canvas p-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-action">
                <span>04</span>
                <ChevronRight className="size-3" />
                <span>24-Hour Action Plan</span>
              </div>
              <p className="mt-1 text-xs text-graphite">
                Designated lead authority takes temporary safety/cleanliness action while permanent jurisdiction responsibility is logged.
              </p>
            </div>
          </div>
        </div>

        {/* DataMeet Verified Municipal Directory Section */}
        <div className="rounded-xl border border-line bg-surface p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 border-b border-line pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-800">
                  <Database className="size-3 text-blue-600" />
                  DataMeet Open Directory
                </span>
                <span className="text-xs text-muted">GeoJSON &amp; CSV Verified</span>
              </div>
              <h2 className="mt-1 font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
                Municipal Ward Offices &amp; Zone Directory
              </h2>
              <p className="mt-0.5 text-xs text-graphite">
                Click any ward or zone to automatically reposition the inspection coordinates, verify boundary polygon status, and retrieve field contacts.
              </p>
            </div>

            {/* Tab switch */}
            <div className="flex items-center gap-1 rounded-lg bg-fog p-1">
              <button
                type="button"
                onClick={() => setDirectoryTab("pmc")}
                className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                  directoryTab === "pmc" ? "bg-action text-white shadow-xs" : "text-graphite hover:text-ink"
                }`}
              >
                PMC 15 Admin Wards ({filteredPmcWards.length})
              </button>
              <button
                type="button"
                onClick={() => setDirectoryTab("pcmc")}
                className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                  directoryTab === "pcmc" ? "bg-action text-white shadow-xs" : "text-graphite hover:text-ink"
                }`}
              >
                PCMC 6 Zonal Offices ({filteredPcmcZones.length})
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="mt-4">
            <div className="relative">
              <input
                type="text"
                value={wardSearchQuery}
                onChange={(e) => setWardSearchQuery(e.target.value)}
                placeholder={
                  directoryTab === "pmc"
                    ? "Search PMC administrative ward by name, Marathi title, area (e.g. Aundh, Kothrud, Hadapsar)..."
                    : "Search PCMC zone by zone key, area or headquarters..."
                }
                className="w-full rounded-lg border border-line bg-canvas pl-9 pr-4 py-2 text-xs font-medium text-ink shadow-inner placeholder:text-muted focus:border-action focus:outline-none"
              />
              <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted" />
            </div>
          </div>

          {/* PMC Administrative Wards View */}
          {directoryTab === "pmc" ? (
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredPmcWards.map((ward) => {
                const isSelected =
                  Math.abs(coords.latitude - ward.lat) < 0.005 && Math.abs(coords.longitude - ward.lon) < 0.005;
                return (
                  <div
                    key={ward.code}
                    className={`flex flex-col justify-between rounded-xl border p-4 transition-all ${
                      isSelected
                        ? "border-blue-500 bg-blue-50/40 shadow-md ring-1 ring-blue-500"
                        : "border-line bg-canvas hover:border-action/40 hover:bg-surface"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1 rounded bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-800">
                          Ward {ward.num.toString().padStart(2, "0")}
                        </span>
                        <span className="font-mono text-[11px] text-muted">
                          {ward.lat.toFixed(4)}, {ward.lon.toFixed(4)}
                        </span>
                      </div>

                      <h3 className="mt-2 font-display text-sm font-bold text-ink">{ward.name}</h3>
                      <p className="text-xs font-semibold text-action">{ward.nameMarathi}</p>

                      <div className="mt-2.5 space-y-1.5 text-xs text-graphite">
                        <div className="flex items-start gap-1.5">
                          <MapPin className="size-3.5 text-muted shrink-0 mt-0.5" />
                          <span className="line-clamp-2 text-[11px]">{ward.address}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <PhoneCall className="size-3.5 text-emerald-600 shrink-0" />
                          <a
                            href={`tel:${ward.helpline.split("/")[0]?.trim() ?? ""}`}
                            className="font-medium text-ink hover:underline text-[11px]"
                          >
                            {ward.helpline}
                          </a>
                        </div>
                      </div>

                      {/* Areas covered badges */}
                      <div className="mt-3 flex flex-wrap gap-1">
                        {ward.areasCovered.map((area) => (
                          <span
                            key={area}
                            className="rounded bg-fog px-1.5 py-0.5 text-[10px] font-medium text-graphite"
                          >
                            {area}
                          </span>
                        ))}
                      </div>

                      {/* Electoral wards count */}
                      <p className="mt-2 text-[10px] text-muted">
                        Electoral Wards ({ward.electoralWards.length}): {ward.electoralWards.join(", ")}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleLocateWard(ward.lat, ward.lon)}
                      className={`mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border py-1.5 text-xs font-semibold shadow-2xs transition-colors ${
                        isSelected
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-line bg-surface text-ink hover:border-action hover:bg-action hover:text-white"
                      }`}
                    >
                      <Compass className="size-3.5" />
                      <span>{isSelected ? "Currently Inspecting" : "Inspect Ward Office on Map"}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            /* PCMC Zones View */
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredPcmcZones.map((zone) => {
                // Zone centroid approx
                const firstWard = zone.electoralWards[0];
                const approxLat = firstWard?.boundary[0]?.[1] ?? 18.62;
                const approxLon = firstWard?.boundary[0]?.[0] ?? 73.8;
                const isSelected =
                  Math.abs(coords.latitude - approxLat) < 0.03 && Math.abs(coords.longitude - approxLon) < 0.03;

                return (
                  <div
                    key={zone.zoneKey}
                    className={`flex flex-col justify-between rounded-xl border p-4 transition-all ${
                      isSelected
                        ? "border-emerald-500 bg-emerald-50/40 shadow-md ring-1 ring-emerald-500"
                        : "border-line bg-canvas hover:border-action/40 hover:bg-surface"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                          Zone {zone.zoneKey}
                        </span>
                        <span className="rounded bg-fog px-2 py-0.5 text-[10px] font-bold text-graphite">
                          {zone.electoralWards.length} Electoral Polygons
                        </span>
                      </div>

                      <h3 className="mt-2 font-display text-sm font-bold text-ink">{zone.name}</h3>
                      <p className="text-xs font-semibold text-emerald-700">{zone.nameMarathi}</p>

                      <div className="mt-2.5 space-y-1.5 text-xs text-graphite">
                        <div className="flex items-start gap-1.5">
                          <Building2 className="size-3.5 text-muted shrink-0 mt-0.5" />
                          <span className="text-[11px]">HQ: {zone.headquarters}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <PhoneCall className="size-3.5 text-emerald-600 shrink-0" />
                          <a
                            href={`tel:${zone.helpline}`}
                            className="font-medium text-ink hover:underline text-[11px]"
                          >
                            {zone.helpline}
                          </a>
                        </div>
                      </div>

                      {/* Electoral ward numbers sample */}
                      <div className="mt-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                          Electoral Wards:
                        </span>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {zone.electoralWards.slice(0, 8).map((w) => (
                            <span
                              key={w.name}
                              className="rounded bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800"
                              title={w.name}
                            >
                              Ward {w.wardnum}
                            </span>
                          ))}
                          {zone.electoralWards.length > 8 && (
                            <span className="rounded bg-fog px-1.5 py-0.5 text-[10px] text-muted">
                              +{zone.electoralWards.length - 8} more
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleLocateWard(approxLat, approxLon)}
                      className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-surface py-1.5 text-xs font-semibold text-ink shadow-2xs transition-colors hover:border-action hover:bg-action hover:text-white"
                    >
                      <Compass className="size-3.5" />
                      <span>Inspect Zone on Map</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </OfficerShell>
  );
}
