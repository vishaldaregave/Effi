"use client";

import { useState } from "react";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Compass,
  MapPin,
  PhoneCall,
  Plus,
  Send,
  Shield,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import {
  routeComplaintByCoordinates,
  type Coordinates,
} from "@effi/domain";

type ComplaintCategory = "roads" | "sanitation" | "water" | "lighting" | "drainage" | "other";

type ComplaintRegistrationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onRegistered?: (complaint: {
    reportNumber: string;
    summary: string;
    category: ComplaintCategory;
    coordinates: Coordinates;
    routing: ReturnType<typeof routeComplaintByCoordinates>;
  }) => void;
};

const PRESET_QUICK_LOCATIONS = [
  { name: "Wakad, Hinjawadi Bridge", coords: { latitude: 18.598, longitude: 73.763 }, auth: "PCMC" },
  { name: "Aundh, Parihar Chowk", coords: { latitude: 18.558, longitude: 73.807 }, auth: "PMC" },
  { name: "Hinjawadi IT Park Phase 1", coords: { latitude: 18.591, longitude: 73.738 }, auth: "GP" },
  { name: "Dapodi Harris Bridge Border", coords: { latitude: 18.577, longitude: 73.826 }, auth: "BUFFER" },
  { name: "Wagholi Town Center", coords: { latitude: 18.581, longitude: 73.980 }, auth: "PMC" },
  { name: "Moshi Alandi Road", coords: { latitude: 18.675, longitude: 73.845 }, auth: "PCMC" },
] as const;

export function ComplaintRegistrationModal({
  isOpen,
  onClose,
  onRegistered,
}: ComplaintRegistrationModalProps) {
  const [summary, setSummary] = useState("");
  const [category, setCategory] = useState<ComplaintCategory>("roads");
  const [channel, setChannel] = useState<"app" | "whatsapp" | "telegram">("whatsapp");
  const [latitude, setLatitude] = useState(18.598);
  const [longitude, setLongitude] = useState(73.763);
  const [citizenName, setCitizenName] = useState("Sunil Deshmukh");
  const [citizenMobile, setCitizenMobile] = useState("+91 98220 12345");
  const [isSuccess, setIsSuccess] = useState(false);
  const [registeredReportNum, setRegisteredReportNum] = useState("");

  // Live real-time coordinate routing
  const routing = routeComplaintByCoordinates({ latitude, longitude }, category);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!summary.trim()) return;

    const reportNum = `REP-2026-${routing.authority}-${Math.floor(1000 + Math.random() * 9000)}`;
    setRegisteredReportNum(reportNum);
    setIsSuccess(true);

    if (onRegistered) {
      onRegistered({
        reportNumber: reportNum,
        summary,
        category,
        coordinates: { latitude, longitude },
        routing,
      });
    }
  };

  const resetForm = () => {
    setIsSuccess(false);
    setSummary("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-2xl border border-line bg-surface p-6 shadow-2xl transition-all">
        {/* Modal Close Button */}
        <button
          type="button"
          onClick={resetForm}
          className="absolute right-4 top-4 grid size-8 place-items-center rounded-lg text-graphite hover:bg-fog hover:text-ink"
        >
          <X className="size-5" />
        </button>

        {isSuccess ? (
          <div className="py-6 text-center">
            <div className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="size-8" />
            </div>
            <h3 className="mt-4 font-display text-2xl font-bold text-ink">Complaint Successfully Registered!</h3>
            <p className="mt-1 text-sm text-graphite">
              Complaint has been routed and assigned to the designated Mahanagarpalika / Grampanchayat officer.
            </p>

            <div className="mx-auto mt-5 max-w-md rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 text-left text-xs text-ink">
              <div className="flex items-center justify-between border-b border-emerald-200/60 pb-2">
                <span className="font-mono font-bold text-emerald-800">{registeredReportNum}</span>
                <span className="rounded bg-emerald-200 px-2 py-0.5 font-bold text-emerald-900">{routing.authority}</span>
              </div>
              <dl className="mt-3 space-y-2">
                <div className="flex justify-between">
                  <dt className="text-muted">Designated Officer:</dt>
                  <dd className="font-semibold">{routing.designatedOfficerTitle}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Department:</dt>
                  <dd className="font-medium text-right">{routing.designatedDepartment}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Target SLA:</dt>
                  <dd className="font-bold text-action">{routing.slaTargetHours} Hours</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Citizen Tracking SMS:</dt>
                  <dd className="font-medium">Dispatched to {citizenMobile}</dd>
                </div>
              </dl>
            </div>

            <button
              type="button"
              onClick={resetForm}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-action px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-action-hover"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded bg-action/10 px-2 py-0.5 text-[11px] font-bold text-action">
                  <Sparkles className="size-3" />
                  Auto-Jurisdiction Intake
                </span>
                <span className="text-xs text-muted">Real-Time GPS Coordinate Calculation</span>
              </div>
              <h2 className="mt-1 font-display text-xl font-bold text-ink sm:text-2xl">
                Register New Civic Complaint
              </h2>
              <p className="text-xs text-graphite">
                Enter issue details and coordinates. Effi will instantly calculate the boundary haad and route to the correct municipal officer.
              </p>
            </div>

            {/* Complaint Summary & Category */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-muted">
                  Issue Summary (तक्रार तपशील)
                </label>
                <input
                  type="text"
                  required
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="e.g. Deep pothole hazardous to two-wheelers near crossroad"
                  className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink shadow-sm focus:border-action focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ComplaintCategory)}
                  className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink shadow-sm focus:border-action focus:outline-none"
                >
                  <option value="roads">Roads & Potholes (रस्ते व खड्डे)</option>
                  <option value="sanitation">Sanitation & Garbage (स्वच्छता व कचरा)</option>
                  <option value="water">Water Supply & Leakage (पाणीपुरवठा)</option>
                  <option value="lighting">Streetlights (पथदिवे)</option>
                  <option value="drainage">Drainage & Sewage (ड्रेनेज)</option>
                  <option value="other">Other Civic Issue (इतर)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted">Reporting Channel</label>
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as any)}
                  className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink shadow-sm focus:border-action focus:outline-none"
                >
                  <option value="whatsapp">WhatsApp Civic Bot</option>
                  <option value="telegram">Telegram Bot</option>
                  <option value="app">Mobile Citizen App</option>
                </select>
              </div>
            </div>

            {/* Coordinates Section with Presets */}
            <div className="rounded-xl border border-line bg-fog/40 p-3.5">
              <span className="block text-xs font-bold uppercase tracking-wider text-muted">
                Geospatial Coordinates (अक्षांश व रेखांश)
              </span>

              <div className="mt-2 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-graphite">Latitude</label>
                  <input
                    type="number"
                    step="any"
                    value={latitude}
                    onChange={(e) => setLatitude(parseFloat(e.target.value) || 0)}
                    className="mt-1 w-full rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-xs text-ink"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-graphite">Longitude</label>
                  <input
                    type="number"
                    step="any"
                    value={longitude}
                    onChange={(e) => setLongitude(parseFloat(e.target.value) || 0)}
                    className="mt-1 w-full rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-xs text-ink"
                  />
                </div>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-bold text-muted uppercase">Quick Pin:</span>
                {PRESET_QUICK_LOCATIONS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => {
                      setLatitude(preset.coords.latitude);
                      setLongitude(preset.coords.longitude);
                    }}
                    className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-[11px] font-medium text-graphite hover:border-action/40 hover:text-ink"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Live Real-Time Jurisdiction Officer Routing Card */}
            <div
              className={`rounded-xl border p-4 transition-all ${
                routing.authority === "PCMC"
                  ? "border-emerald-300 bg-emerald-50/60"
                  : routing.authority === "PMC"
                    ? "border-blue-300 bg-blue-50/60"
                    : routing.authority === "GRAMPANCHAYAT"
                      ? "border-amber-300 bg-amber-50/60"
                      : "border-purple-300 bg-purple-50/60"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-bold text-ink">
                  <Shield className="size-4 text-action" />
                  <span>Calculated Officer Routing</span>
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold text-white ${
                    routing.authority === "PCMC"
                      ? "bg-emerald-600"
                      : routing.authority === "PMC"
                        ? "bg-blue-600"
                        : routing.authority === "GRAMPANCHAYAT"
                          ? "bg-amber-600"
                          : "bg-purple-600"
                  }`}
                >
                  {routing.authority} ({routing.inMahanagarpalikaHaad ? "महानगरपालिका हद्द" : "ग्रामपंचायत"})
                </span>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                <div>
                  <span className="text-muted block text-[11px]">Designated Officer:</span>
                  <strong className="text-ink">{routing.designatedOfficerTitle}</strong>
                </div>
                <div>
                  <span className="text-muted block text-[11px]">Target Department:</span>
                  <span className="font-medium text-ink">{routing.designatedDepartment}</span>
                </div>
                <div>
                  <span className="text-muted block text-[11px]">Zone / Prabhag Office:</span>
                  <span className="font-semibold text-action">{routing.zoneOrWard}</span>
                </div>
                <div>
                  <span className="text-muted block text-[11px]">SLA Response Deadline:</span>
                  <strong className="text-emerald-700">{routing.slaTargetHours} Hours SLA</strong>
                </div>
              </div>

              {routing.isBorderlandBuffer ? (
                <div className="mt-2.5 flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-100/70 p-2 text-xs text-amber-900">
                  <ShieldAlert className="size-4 shrink-0 text-amber-700 mt-0.5" />
                  <span>
                    <strong>Borderland Buffer Zone:</strong> Joint coordination alert activated under Section 67 MMCA to prevent ticket ping-pong.
                  </span>
                </div>
              ) : null}
            </div>

            {/* Citizen Contact Details */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-graphite">Citizen Name</label>
                <input
                  type="text"
                  value={citizenName}
                  onChange={(e) => setCitizenName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-line bg-canvas px-2.5 py-1.5 text-xs text-ink"
                />
              </div>
              <div>
                <label className="block text-[11px] text-graphite">Mobile (SMS Updates)</label>
                <input
                  type="text"
                  value={citizenMobile}
                  onChange={(e) => setCitizenMobile(e.target.value)}
                  className="mt-1 w-full rounded-md border border-line bg-canvas px-2.5 py-1.5 text-xs text-ink"
                />
              </div>
            </div>

            {/* Submit Action */}
            <div className="flex items-center justify-end gap-3 border-t border-line pt-3">
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-line px-4 py-2 text-xs font-semibold text-graphite hover:bg-fog"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-lg bg-action px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-action-hover"
              >
                <Send className="size-3.5" />
                <span>Register & Route Complaint</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
