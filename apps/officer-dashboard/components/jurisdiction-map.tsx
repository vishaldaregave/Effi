"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AttributionControl,
  Layer,
  Map,
  Marker,
  NavigationControl,
  Popup,
  Source,
  type LayerProps,
  type MapLayerMouseEvent,
  type MarkerDragEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Compass,
  Layers,
  MapPin,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  Shield,
  Shrink,
  Waves,
  X,
} from "lucide-react";
import {
  BORDER_DISPUTE_THRESHOLD_METRES,
  GEOGRAPHIC_DIVIDERS,
  JURISDICTION_FEATURES,
  DATAMEET_PMC_ADMIN_WARDS,
  DATAMEET_PCMC_ZONES,
  type Coordinates,
  type JurisdictionResolution,
} from "@effi/domain";

const mapStyle = "https://tiles.openfreemap.org/styles/positron";

// ============================================================================
// Layer Paint Definitions (Including DataMeet Wards)
// ============================================================================

const datameetPmcFillLayer: LayerProps = {
  id: "datameet-pmc-fill",
  type: "fill",
  paint: {
    "fill-color": [
      "match",
      ["get", "wardNum"],
      1, "#3b82f6",
      2, "#6366f1",
      3, "#8b5cf6",
      4, "#a855f7",
      5, "#d946ef",
      6, "#ec4899",
      7, "#f43f5e",
      8, "#ef4444",
      9, "#f97316",
      10, "#f59e0b",
      11, "#eab308",
      12, "#84cc16",
      13, "#10b981",
      14, "#06b6d4",
      15, "#0ea5e9",
      "#2563eb",
    ],
    "fill-opacity": 0.22,
  },
};

const datameetPmcLineLayer: LayerProps = {
  id: "datameet-pmc-outline",
  type: "line",
  paint: {
    "line-color": "#1e3a8a",
    "line-width": 2,
  },
};

const datameetPcmcFillLayer: LayerProps = {
  id: "datameet-pcmc-fill",
  type: "fill",
  paint: {
    "fill-color": [
      "match",
      ["get", "zone"],
      "A", "#10b981",
      "B", "#14b8a6",
      "C", "#06b6d4",
      "D", "#0284c7",
      "E", "#3b82f6",
      "F", "#6366f1",
      "#059669",
    ],
    "fill-opacity": 0.18,
  },
};

const datameetPcmcLineLayer: LayerProps = {
  id: "datameet-pcmc-outline",
  type: "line",
  paint: {
    "line-color": "#065f46",
    "line-width": 1.6,
    "line-dasharray": [3, 2],
  },
};

const pcmcFillLayer: LayerProps = {
  id: "pcmc-fill",
  type: "fill",
  paint: {
    "fill-color": "#059669",
    "fill-opacity": 0.14,
  },
};

const pcmcLineLayer: LayerProps = {
  id: "pcmc-outline",
  type: "line",
  paint: {
    "line-color": "#047857",
    "line-width": 2.5,
    "line-dasharray": [3, 2],
  },
};

const pmcFillLayer: LayerProps = {
  id: "pmc-fill",
  type: "fill",
  paint: {
    "fill-color": "#2563eb",
    "fill-opacity": 0.14,
  },
};

const pmcLineLayer: LayerProps = {
  id: "pmc-outline",
  type: "line",
  paint: {
    "line-color": "#1d4ed8",
    "line-width": 2.5,
    "line-dasharray": [3, 2],
  },
};

const grampanchayatFillLayer: LayerProps = {
  id: "gp-fill",
  type: "fill",
  paint: {
    "fill-color": "#d97706",
    "fill-opacity": 0.18,
  },
};

const grampanchayatLineLayer: LayerProps = {
  id: "gp-outline",
  type: "line",
  paint: {
    "line-color": "#b45309",
    "line-width": 2.2,
    "line-dasharray": [2, 2],
  },
};

const cantonmentFillLayer: LayerProps = {
  id: "cantonment-fill",
  type: "fill",
  paint: {
    "fill-color": "#7c3aed",
    "fill-opacity": 0.2,
  },
};

const cantonmentLineLayer: LayerProps = {
  id: "cantonment-outline",
  type: "line",
  paint: {
    "line-color": "#6d28d9",
    "line-width": 2.2,
    "line-dasharray": [4, 2],
  },
};

const riverLineLayer: LayerProps = {
  id: "river-lines",
  type: "line",
  paint: {
    "line-color": "#0284c7",
    "line-width": 3,
  },
};

export type MapViewMode = "normal" | "minimized" | "maximized";

export type JurisdictionMapProps = {
  activeCoordinates: Coordinates;
  resolution: JurisdictionResolution;
  onCoordinatesChange: (coords: Coordinates) => void;
  viewMode?: MapViewMode;
  onViewModeChange?: (mode: MapViewMode) => void;
};

export function JurisdictionMap({
  activeCoordinates,
  resolution,
  onCoordinatesChange,
  viewMode,
  onViewModeChange,
}: JurisdictionMapProps) {
  const mapRef = useRef<MapRef | null>(null);
  const [internalViewMode, setInternalViewMode] = useState<MapViewMode>("normal");
  const currentViewMode = viewMode ?? internalViewMode;

  const [mapFailed, setMapFailed] = useState(false);
  const [showPcmc, setShowPcmc] = useState(true);
  const [showPmc, setShowPmc] = useState(true);
  const [showDatameetPmcWards, setShowDatameetPmcWards] = useState(true);
  const [showDatameetPcmcZones, setShowDatameetPcmcZones] = useState(true);
  const [showGrampanchayat, setShowGrampanchayat] = useState(true);
  const [showCantonment, setShowCantonment] = useState(true);
  const [showRivers, setShowRivers] = useState(true);
  const [showInfoPopup, setShowInfoPopup] = useState(true);
  const [isLegendOpen, setIsLegendOpen] = useState(true);

  const activeLayerCount = [
    showDatameetPmcWards,
    showDatameetPcmcZones,
    showPcmc,
    showPmc,
    showGrampanchayat,
    showCantonment,
    showRivers,
  ].filter(Boolean).length;

  const setMode = (nextMode: MapViewMode) => {
    if (onViewModeChange) {
      onViewModeChange(nextMode);
    } else {
      setInternalViewMode(nextMode);
    }
    setTimeout(() => {
      mapRef.current?.resize();
    }, 150);
  };

  const handleZoomIn = () => {
    mapRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    mapRef.current?.zoomOut();
  };

  const handleToggleMaximize = () => {
    setMode(currentViewMode === "maximized" ? "normal" : "maximized");
  };

  const handleToggleMinimize = () => {
    setMode(currentViewMode === "minimized" ? "normal" : "minimized");
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && currentViewMode === "maximized") {
        setMode("normal");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentViewMode]);

  // DataMeet Official PMC 15 Administrative Wards GeoJSON
  const datameetPmcGeoJson = useMemo(() => {
    return {
      type: "FeatureCollection" as const,
      features: DATAMEET_PMC_ADMIN_WARDS.map((w) => ({
        type: "Feature" as const,
        properties: {
          name: w.name,
          nameMarathi: w.nameMarathi,
          code: w.code,
          address: w.address,
          helpline: w.helpline,
          wardNum: w.num,
        },
        geometry: {
          type: "Polygon" as const,
          coordinates: [w.boundary as [number, number][]],
        },
      })),
    };
  }, []);

  // DataMeet Official PCMC Electoral Wards & Zones GeoJSON
  const datameetPcmcGeoJson = useMemo(() => {
    const features: {
      type: "Feature";
      properties: { name: string; zone: string; wardnum: number | string };
      geometry: { type: "Polygon"; coordinates: [number, number][][] };
    }[] = [];

    DATAMEET_PCMC_ZONES.forEach((z) => {
      z.electoralWards.forEach((w) => {
        features.push({
          type: "Feature" as const,
          properties: {
            name: `${z.name} - ${w.name}`,
            zone: z.zoneKey,
            wardnum: w.wardnum,
          },
          geometry: {
            type: "Polygon" as const,
            coordinates: [w.boundary as [number, number][]],
          },
        });
      });
    });

    return {
      type: "FeatureCollection" as const,
      features,
    };
  }, []);

  // GeoJSON data sources
  const pcmcGeoJson = useMemo(() => {
    const f = JURISDICTION_FEATURES.find((item) => item.id === "pcmc-haad");
    return {
      type: "FeatureCollection" as const,
      features: f
        ? [
            {
              type: "Feature" as const,
              properties: { name: f.name, authority: "PCMC" },
              geometry: {
                type: "Polygon" as const,
                coordinates: [f.coordinates],
              },
            },
          ]
        : [],
    };
  }, []);

  const pmcGeoJson = useMemo(() => {
    const f = JURISDICTION_FEATURES.find((item) => item.id === "pmc-haad");
    return {
      type: "FeatureCollection" as const,
      features: f
        ? [
            {
              type: "Feature" as const,
              properties: { name: f.name, authority: "PMC" },
              geometry: {
                type: "Polygon" as const,
                coordinates: [f.coordinates],
              },
            },
          ]
        : [],
    };
  }, []);

  const gpGeoJson = useMemo(() => {
    const gpFeatures = JURISDICTION_FEATURES.filter((item) => item.classification === "grampanchayat_jurisdiction");
    return {
      type: "FeatureCollection" as const,
      features: gpFeatures.map((f) => ({
        type: "Feature" as const,
        properties: { name: f.name, authority: f.authority },
        geometry: {
          type: "Polygon" as const,
          coordinates: [f.coordinates],
        },
      })),
    };
  }, []);

  const cantonmentGeoJson = useMemo(() => {
    const cantFeatures = JURISDICTION_FEATURES.filter((item) => item.classification === "cantonment_board");
    return {
      type: "FeatureCollection" as const,
      features: cantFeatures.map((f) => ({
        type: "Feature" as const,
        properties: { name: f.name, authority: f.authority },
        geometry: {
          type: "Polygon" as const,
          coordinates: [f.coordinates],
        },
      })),
    };
  }, []);

  const riversGeoJson = useMemo(() => {
    return {
      type: "FeatureCollection" as const,
      features: GEOGRAPHIC_DIVIDERS.map((div) => ({
        type: "Feature" as const,
        properties: { name: div.name, color: div.color },
        geometry: {
          type: "LineString" as const,
          coordinates: div.coordinates as unknown as [number, number][],
        },
      })),
    };
  }, []);

  const handleMapClick = (e: MapLayerMouseEvent) => {
    const lat = Number(e.lngLat.lat.toFixed(5));
    const lng = Number(e.lngLat.lng.toFixed(5));
    onCoordinatesChange({ latitude: lat, longitude: lng });
    setShowInfoPopup(true);
  };

  const handleMarkerDragEnd = (e: MarkerDragEvent) => {
    const lat = Number(e.lngLat.lat.toFixed(5));
    const lng = Number(e.lngLat.lng.toFixed(5));
    onCoordinatesChange({ latitude: lat, longitude: lng });
    setShowInfoPopup(true);
  };

  const handleRecenter = () => {
    onCoordinatesChange({ latitude: 18.5772, longitude: 73.8245 }); // Harris Bridge center
  };

  const mapContent = (
    <div className="relative h-full w-full overflow-hidden bg-[#e9eef1]">
      <Map
        ref={mapRef}
        initialViewState={{
          latitude: activeCoordinates.latitude,
          longitude: activeCoordinates.longitude,
          zoom: 11.8,
        }}
        mapStyle={mapStyle}
        attributionControl={false}
        onClick={handleMapClick}
        onError={() => setMapFailed(true)}
        reuseMaps
      >
        {/* PCMC Mahanagarpalika Haad Layer */}
        {showPcmc ? (
          <Source id="pcmc-source" type="geojson" data={pcmcGeoJson}>
            <Layer {...pcmcFillLayer} />
            <Layer {...pcmcLineLayer} />
          </Source>
        ) : null}

        {/* DataMeet PCMC Electoral Zones Layer */}
        {showDatameetPcmcZones ? (
          <Source id="datameet-pcmc-source" type="geojson" data={datameetPcmcGeoJson}>
            <Layer {...datameetPcmcFillLayer} />
            <Layer {...datameetPcmcLineLayer} />
          </Source>
        ) : null}

        {/* PMC Mahanagarpalika Haad Layer */}
        {showPmc ? (
          <Source id="pmc-source" type="geojson" data={pmcGeoJson}>
            <Layer {...pmcFillLayer} />
            <Layer {...pmcLineLayer} />
          </Source>
        ) : null}

        {/* DataMeet PMC 15 Administrative Wards Layer */}
        {showDatameetPmcWards ? (
          <Source id="datameet-pmc-source" type="geojson" data={datameetPmcGeoJson}>
            <Layer {...datameetPmcFillLayer} />
            <Layer {...datameetPmcLineLayer} />
          </Source>
        ) : null}

        {/* Grampanchayat (PMRDA) Layer */}
        {showGrampanchayat ? (
          <Source id="gp-source" type="geojson" data={gpGeoJson}>
            <Layer {...grampanchayatFillLayer} />
            <Layer {...grampanchayatLineLayer} />
          </Source>
        ) : null}

        {/* Cantonment Boards Layer */}
        {showCantonment ? (
          <Source id="cantonment-source" type="geojson" data={cantonmentGeoJson}>
            <Layer {...cantonmentFillLayer} />
            <Layer {...cantonmentLineLayer} />
          </Source>
        ) : null}

        {/* Natural Boundary Dividing Rivers */}
        {showRivers ? (
          <Source id="rivers-source" type="geojson" data={riversGeoJson}>
            <Layer {...riverLineLayer} />
          </Source>
        ) : null}

        {/* Inspection Target Pin */}
        <Marker
          latitude={activeCoordinates.latitude}
          longitude={activeCoordinates.longitude}
          draggable
          onDragEnd={handleMarkerDragEnd}
          anchor="bottom"
        >
          <div className="group relative flex cursor-grab flex-col items-center active:cursor-grabbing">
            <span
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold text-white shadow-md ${
                resolution.authority === "PCMC"
                  ? "bg-emerald-600"
                  : resolution.authority === "PMC"
                    ? "bg-blue-600"
                    : resolution.authority === "GRAMPANCHAYAT"
                      ? "bg-amber-600"
                      : "bg-purple-600"
              }`}
            >
              <MapPin className="size-3" />
              {resolution.authority}
            </span>
            <div className="size-4 -translate-y-1 rotate-45 rounded-sm bg-ink" />
          </div>
        </Marker>

        {/* Interactive Coordinate Resolution Tooltip */}
        {showInfoPopup ? (
          <Popup
            latitude={activeCoordinates.latitude}
            longitude={activeCoordinates.longitude}
            offset={[0, -32]}
            closeButton
            onClose={() => setShowInfoPopup(false)}
            className="effi-map-popup"
            maxWidth="320px"
          >
            <div className="p-1 text-ink">
              <div className="flex items-center justify-between gap-2 border-b border-line pb-2">
                <span
                  className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white ${
                    resolution.authority === "PCMC"
                      ? "bg-emerald-600"
                      : resolution.authority === "PMC"
                        ? "bg-blue-600"
                        : resolution.authority === "GRAMPANCHAYAT"
                          ? "bg-amber-600"
                          : "bg-purple-600"
                  }`}
                >
                  <Shield className="size-3" />
                  {resolution.authority}
                </span>
                <span className="text-[11px] font-semibold text-graphite">
                  {resolution.inMahanagarpalikaHaad ? "महानगरपालिका हद्द" : "ग्रामपंचायत हद्द"}
                </span>
              </div>

              <h4 className="mt-2 text-sm font-bold text-ink">{resolution.authorityFullName}</h4>
              <p className="mt-0.5 text-xs text-graphite">{resolution.detectedZoneOrPanchayat}</p>

              {resolution.isBorderlandBuffer ? (
                <div className="mt-2 flex items-start gap-1.5 rounded bg-amber-50 p-2 text-xs text-amber-800 border border-amber-200">
                  <AlertTriangle className="size-4 shrink-0 text-amber-600 mt-0.5" />
                  <span>
                    <strong>Borderland Buffer (&lt; {BORDER_DISPUTE_THRESHOLD_METRES}m):</strong> High risk of inter-agency transfer dispute.
                  </span>
                </div>
              ) : null}

              <div className="mt-2.5 grid grid-cols-2 gap-2 text-[11px] bg-fog/60 p-2 rounded">
                <div>
                  <span className="text-muted block">Distance to Border</span>
                  <strong className="text-ink">{resolution.distanceToNearestBoundaryMetres} m</strong>
                </div>
                <div>
                  <span className="text-muted block">Helpline</span>
                  <strong className="text-ink">{resolution.grievanceHelpline.split("/")[0]}</strong>
                </div>
              </div>
            </div>
          </Popup>
        ) : null}

        <NavigationControl position="bottom-right" showCompass />
        <AttributionControl position="bottom-right" compact />
      </Map>

      {/* Map Layers & Legend Toggle Overlay */}
      {!isLegendOpen ? (
        <button
          type="button"
          onClick={() => setIsLegendOpen(true)}
          className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full border border-line/80 bg-surface/95 px-2.5 py-1 text-xs font-semibold text-ink shadow-panel backdrop-blur-sm transition-all hover:bg-fog hover:scale-[1.02] active:scale-[0.98] sm:left-4 sm:top-4"
          title="Open Geospatial Haad Demarcation (Click to open)"
          aria-label="Open Geospatial Haad Demarcation layers"
        >
          <Layers className="size-3.5 text-action" />
          <span className="font-display text-[11px] font-bold text-ink">Layers</span>
          <span className="rounded-full bg-action/10 px-1.5 py-0.2 text-[10px] font-bold text-action">
            {activeLayerCount}
          </span>
          <ChevronDown className="size-3 text-graphite ml-0.5" />
        </button>
      ) : (
        <div className="absolute left-3 top-3 z-10 flex max-w-[calc(100%-4.5rem)] flex-col rounded-lg bg-surface/95 shadow-panel backdrop-blur-sm sm:left-4 sm:top-4 transition-all">
          <div
            onClick={() => setIsLegendOpen(false)}
            className="flex cursor-pointer items-center justify-between gap-3 border-b border-line p-2.5 sm:px-3 sm:py-2 select-none hover:bg-fog/50 rounded-t-lg transition-colors"
          >
            <div className="flex items-center gap-2">
              <Layers className="size-4 text-action" />
              <span className="font-display text-xs font-bold text-ink">Geospatial Haad Demarcation</span>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsLegendOpen(false);
              }}
              className="grid size-6 place-items-center rounded-md border border-line/60 bg-surface text-graphite hover:bg-fog hover:text-ink transition-colors shadow-2xs"
              title="Minimize legend (Click to close)"
              aria-label="Minimize legend"
            >
              <ChevronUp className="size-3.5" />
            </button>
          </div>

          <div className="p-3 pt-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label className="flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 transition-colors hover:bg-fog">
                <input
                  type="checkbox"
                  checked={showDatameetPmcWards}
                  onChange={(e) => setShowDatameetPmcWards(e.target.checked)}
                  className="accent-blue-700"
                />
                <span className="size-2 rounded-full bg-blue-700" />
                <span className="font-semibold text-graphite">DataMeet PMC 15 Wards</span>
              </label>

              <label className="flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 transition-colors hover:bg-fog">
                <input
                  type="checkbox"
                  checked={showDatameetPcmcZones}
                  onChange={(e) => setShowDatameetPcmcZones(e.target.checked)}
                  className="accent-emerald-700"
                />
                <span className="size-2 rounded-full bg-emerald-700" />
                <span className="font-semibold text-graphite">DataMeet PCMC Zones</span>
              </label>

              <label className="flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 transition-colors hover:bg-fog">
                <input
                  type="checkbox"
                  checked={showPcmc}
                  onChange={(e) => setShowPcmc(e.target.checked)}
                  className="accent-emerald-600"
                />
                <span className="size-2 rounded-full bg-emerald-600" />
                <span className="font-semibold text-graphite">PCMC Outer Haad</span>
              </label>

              <label className="flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 transition-colors hover:bg-fog">
                <input
                  type="checkbox"
                  checked={showPmc}
                  onChange={(e) => setShowPmc(e.target.checked)}
                  className="accent-blue-600"
                />
                <span className="size-2 rounded-full bg-blue-600" />
                <span className="font-semibold text-graphite">PMC Outer Haad</span>
              </label>

              <label className="flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 transition-colors hover:bg-fog">
                <input
                  type="checkbox"
                  checked={showGrampanchayat}
                  onChange={(e) => setShowGrampanchayat(e.target.checked)}
                  className="accent-amber-600"
                />
                <span className="size-2 rounded-full bg-amber-600" />
                <span className="font-semibold text-graphite">Grampanchayat (PMRDA/हिंजवडी)</span>
              </label>

              <label className="flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 transition-colors hover:bg-fog">
                <input
                  type="checkbox"
                  checked={showCantonment}
                  onChange={(e) => setShowCantonment(e.target.checked)}
                  className="accent-purple-600"
                />
                <span className="size-2 rounded-full bg-purple-600" />
                <span className="font-semibold text-graphite">Cantonments (खडकी/कॅम्प)</span>
              </label>

              <label className="flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 transition-colors hover:bg-fog">
                <input
                  type="checkbox"
                  checked={showRivers}
                  onChange={(e) => setShowRivers(e.target.checked)}
                  className="accent-sky-600"
                />
                <Waves className="size-3 text-sky-600" />
                <span className="font-semibold text-graphite">Dividing Rivers (मुळा/पवना)</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Controls Toolbar (+ / - Zoom, Maximize, Minimize, Recenter) */}
      <div className="absolute right-3 top-3 z-10 flex flex-col items-center rounded-xl border border-line bg-surface/95 p-1 shadow-md backdrop-blur-sm sm:right-4 sm:top-4 divide-y divide-line/60">
        {/* Zoom In & Out Controls (+ / -) */}
        <div className="flex flex-col gap-1 pb-1">
          <button
            type="button"
            onClick={handleZoomIn}
            className="grid size-8 place-items-center rounded-lg bg-surface hover:bg-fog text-ink transition-colors font-bold shadow-2xs hover:text-action"
            title="Zoom In (+)"
            aria-label="Zoom In"
          >
            <Plus className="size-4 stroke-[2.5]" />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            className="grid size-8 place-items-center rounded-lg bg-surface hover:bg-fog text-ink transition-colors font-bold shadow-2xs hover:text-action"
            title="Zoom Out (-)"
            aria-label="Zoom Out"
          >
            <Minus className="size-4 stroke-[2.5]" />
          </button>
        </div>

        {/* Viewport Resize Controls (Maximize & Minimize) */}
        <div className="flex flex-col gap-1 py-1">
          <button
            type="button"
            onClick={handleToggleMaximize}
            className={`grid size-8 place-items-center rounded-lg transition-colors shadow-2xs ${
              currentViewMode === "maximized"
                ? "bg-action text-white"
                : "bg-surface hover:bg-fog text-graphite hover:text-ink"
            }`}
            title={currentViewMode === "maximized" ? "Restore Standard View" : "Maximize Map (Fullscreen)"}
            aria-label="Maximize Map"
          >
            {currentViewMode === "maximized" ? (
              <Minimize2 className="size-4" />
            ) : (
              <Maximize2 className="size-4" />
            )}
          </button>
          <button
            type="button"
            onClick={handleToggleMinimize}
            className={`grid size-8 place-items-center rounded-lg transition-colors shadow-2xs ${
              currentViewMode === "minimized"
                ? "bg-action text-white"
                : "bg-surface hover:bg-fog text-graphite hover:text-ink"
            }`}
            title={currentViewMode === "minimized" ? "Restore Standard Height" : "Minimize Map (Compact View)"}
            aria-label="Minimize Map"
          >
            <Shrink className="size-4" />
          </button>
        </div>

        {/* Recenter */}
        <div className="pt-1">
          <button
            type="button"
            onClick={handleRecenter}
            className="grid size-8 place-items-center rounded-lg bg-surface hover:bg-fog text-graphite hover:text-action transition-colors shadow-2xs"
            title="Center on Border Divide (Harris Bridge)"
            aria-label="Center on Border Divide"
          >
            <Compass className="size-4" />
          </button>
        </div>
      </div>

      {mapFailed ? (
        <div className="absolute inset-x-3 bottom-3 z-20 flex items-center justify-between gap-4 rounded-md border border-[#d9b6b6] bg-[#fff8f7] px-4 py-3 text-sm text-danger shadow-panel">
          <p>Some map tiles could not load. Check network connection and retry.</p>
          <button className="font-semibold underline underline-offset-4" type="button" onClick={() => setMapFailed(false)}>
            Retry
          </button>
        </div>
      ) : null}
    </div>
  );

  if (currentViewMode === "maximized") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-ink/75 p-2 sm:p-5 backdrop-blur-md">
        <div className="relative flex h-full w-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
          {/* Maximized Header Toolbar */}
          <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="grid size-6 place-items-center rounded bg-action/10 text-action">
                <Compass className="size-4" />
              </span>
              <span className="font-display text-sm font-bold text-ink">
                Geospatial Boundary Demarcation Map (Expanded Fullscreen)
              </span>
              <span className="rounded bg-fog px-2 py-0.5 text-xs font-mono text-graphite hidden sm:inline">
                {activeCoordinates.latitude.toFixed(5)}, {activeCoordinates.longitude.toFixed(5)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleZoomIn}
                className="grid size-8 place-items-center rounded-lg border border-line bg-surface text-ink hover:bg-fog shadow-2xs font-bold"
                title="Zoom In (+)"
              >
                <Plus className="size-4 stroke-[2.5]" />
              </button>
              <button
                type="button"
                onClick={handleZoomOut}
                className="grid size-8 place-items-center rounded-lg border border-line bg-surface text-ink hover:bg-fog shadow-2xs font-bold"
                title="Zoom Out (-)"
              >
                <Minus className="size-4 stroke-[2.5]" />
              </button>
              <button
                type="button"
                onClick={() => setMode("normal")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-graphite hover:bg-fog hover:text-ink shadow-2xs"
                title="Restore Normal View (Esc)"
              >
                <Minimize2 className="size-3.5" />
                <span>Restore View</span>
              </button>
            </div>
          </div>

          {/* Fullscreen Map Canvas */}
          <div className="relative flex-1 h-full w-full">
            {mapContent}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl border border-line bg-[#e9eef1] shadow-sm transition-all duration-300 ${
        currentViewMode === "minimized" ? "h-[280px]" : "h-[540px]"
      }`}
    >
      {mapContent}
    </div>
  );
}
