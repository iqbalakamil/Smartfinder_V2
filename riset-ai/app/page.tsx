"use client";

import type React from "react";
import { useMemo, useState } from "react";
import {
  BUSINESS_TYPES,
  PRICE_SEGMENTS,
  RESEARCH_PARAMS,
  INDONESIA_CITIES,
  type BusinessInput,
  type ResearchResult,
  type ResearchStep,
} from "@/app/types";

type StreamEvent =
  | { type: "step"; step: ResearchStep }
  | { type: "kelurahan"; data: ResearchResult["kelurahan"] }
  | { type: "poi"; data: ResearchResult["poi"] }
  | { type: "digital"; data: ResearchResult["digitalTraces"] }
  | { type: "scores"; data: ResearchResult["parameterScores"] }
  | { type: "result"; result: ResearchResult }
  | { type: "log"; stage: string; message: string; ms?: number }
  | { type: "error"; message: string };

const INITIAL_FORM: BusinessInput = {
  businessName: "Smartkidz Ruko Riset",
  businessType: BUSINESS_TYPES[0],
  priceSegment: PRICE_SEGMENTS[1],
  analysisMode: "deep",
  locationStandard: "Radius 3 km dari titik kandidat",
  researchParams: [...RESEARCH_PARAMS],
  coordinates: {
    lat: -6.3029,
    lng: 106.9244,
  },
  city: "",
  district: "",
  subDistrict: "",
};

const DEFAULT_STEPS: ResearchStep[] = [
  { id: "radius", title: "📍 Memetakan radius 3km", status: "pending" },
  { id: "kelurahan", title: "🗺️ Mengidentifikasi kelurahan", status: "pending" },
  { id: "poi", title: "🏘️ Memetakan POI (perumahan, kompetitor, promosi)", status: "pending" },
  { id: "digital", title: "🔍 Melacak jejak digital & media sosial", status: "pending" },
  { id: "agent", title: "🤖 Analisis mendalam via AI Agent", status: "pending" },
  { id: "scoring", title: "📊 Menghitung skor kelayakan", status: "pending" },
  { id: "verdict", title: "🎯 Menyusun rekomendasi akhir", status: "pending" },
];

export default function Home() {
  const [form, setForm] = useState<BusinessInput>(INITIAL_FORM);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<ResearchStep[]>(DEFAULT_STEPS);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [kelurahanCount, setKelurahanCount] = useState(0);
  const [digitalCount, setDigitalCount] = useState(0);
  const [scoreItems, setScoreItems] = useState<ResearchResult["parameterScores"]>([]);
  const [liveStatus, setLiveStatus] = useState("Menunggu input riset baru.");
  const [coordinateText, setCoordinateText] = useState(
    `${INITIAL_FORM.coordinates.lat}, ${INITIAL_FORM.coordinates.lng}`
  );
  const [logs, setLogs] = useState<string[]>([]);

  const completedSteps = useMemo(
    () => steps.filter((step) => step.status === "done").length,
    [steps]
  );
  const runningStep = useMemo(
    () => steps.find((step) => step.status === "running") ?? null,
    [steps]
  );
  const progress = Math.round((completedSteps / steps.length) * 100);

  function patchResearchParam(param: string) {
    setForm((current) => {
      const exists = current.researchParams.includes(param);
      return {
        ...current,
        researchParams: exists
          ? current.researchParams.filter((item) => item !== param)
          : [...current.researchParams, param],
      };
    });
  }

  function updateField<K extends keyof BusinessInput>(key: K, value: BusinessInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateCoordinateText(value: string) {
    setCoordinateText(value);
    const parts = value.split(",").map((part) => part.trim());
    if (parts.length !== 2) return;

    const lat = Number(parts[0]);
    const lng = Number(parts[1]);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;

    setForm((current) => ({
      ...current,
      coordinates: { lat, lng },
    }));
  }

  async function runResearch() {
    setIsRunning(true);
    setError(null);
    setResult(null);
    setSteps(DEFAULT_STEPS.map((step) => ({ ...step, status: "pending" })));
    setKelurahanCount(0);
    setDigitalCount(0);
    setScoreItems([]);
    setLiveStatus("Mengirim permintaan penelitian...");
    setCoordinateText(`${form.coordinates.lat}, ${form.coordinates.lng}`);
    setLogs([]);

    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        throw new Error(`Research API gagal: ${response.status} ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error("Response stream tidak tersedia.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const handleEvent = (event: StreamEvent) => {
        if (event.type === "step") {
          setSteps((current) =>
            current.map((item) => (item.id === event.step.id ? event.step : item))
          );
          setLiveStatus(event.step.detail ?? event.step.title);
          return;
        }

        if (event.type === "kelurahan") {
          setKelurahanCount(event.data.length);
          setLiveStatus(`Kelurahan terpetakan: ${event.data.length}`);
          return;
        }

        if (event.type === "digital") {
          setDigitalCount(event.data.length);
          setLiveStatus(`Jejak digital ditemukan: ${event.data.length}`);
          return;
        }

        if (event.type === "scores") {
          setScoreItems(event.data);
          setLiveStatus("Skor parameter dihitung.");
          return;
        }

        if (event.type === "result") {
          setResult(event.result);
          setSteps(event.result.researchSteps);
          setLiveStatus(`Verdict akhir: ${event.result.verdict}`);
          return;
        }

        if (event.type === "log") {
          const duration = typeof event.ms === "number" ? ` - ${event.ms}ms` : "";
          const entry = `[${event.stage}] ${event.message}${duration}`;
          setLogs((current) => [entry, ...current].slice(0, 12));
          setLiveStatus(event.message);
          return;
        }

        if (event.type === "error") {
          throw new Error(event.message);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let separatorIndex = buffer.indexOf("\n\n");
        while (separatorIndex !== -1) {
          const packet = buffer.slice(0, separatorIndex);
          buffer = buffer.slice(separatorIndex + 2);

          const dataLine = packet
            .split("\n")
            .filter((line) => line.startsWith("data: "))
            .map((line) => line.slice(6))
            .join("\n");

          if (dataLine && dataLine !== "[DONE]") {
            try {
              handleEvent(JSON.parse(dataLine) as StreamEvent);
            } catch {
              // Ignore malformed packets and continue consuming the stream.
            }
          }

          separatorIndex = buffer.indexOf("\n\n");
        }
      }

      setLiveStatus("Penelitian selesai.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan yang tidak diketahui.");
      setLiveStatus("Penelitian gagal dijalankan.");
    } finally {
      setIsRunning(false);
    }
  }

  const verdictTone =
    result?.verdict === "LAYAK"
      ? "from-emerald-500/25 to-cyan-500/10 border-emerald-400/30"
      : result?.verdict === "PERLU_KAJIAN"
        ? "from-amber-500/25 to-orange-500/10 border-amber-400/30"
        : result?.verdict === "TIDAK_LAYAK"
          ? "from-rose-500/25 to-red-500/10 border-rose-400/30"
          : "from-slate-500/20 to-slate-500/5 border-white/10";

  const scorePercent =
    result && result.maxTotalScore > 0
      ? Math.round((result.totalScore / result.maxTotalScore) * 100)
      : 0;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070812] text-zinc-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.15),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(99,102,241,0.18),_transparent_30%),radial-gradient(circle_at_bottom,_rgba(245,158,11,0.10),_transparent_30%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:56px_56px] opacity-35" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 lg:px-8">
        <header className="glass-card border-white/10 bg-[#0b1020]/85 p-6 shadow-2xl shadow-cyan-950/20">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-4">
              <span className="inline-flex rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.25em] text-cyan-200">
                Dashboard Riset AI
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[360px] lg:grid-cols-1">
              <Metric label="Progress" value={`${progress}%`} hint={runningStep ? runningStep.title : "Siap jalan"} />
              <Metric label="Kelurahan" value={String(kelurahanCount)} hint="Dalam radius 3 km" />
              <Metric label="Digital" value={String(digitalCount)} hint="Jejak digital terkumpul" />
            </div>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="glass-card border-white/10 bg-[#0b1020]/80 p-6 shadow-xl shadow-black/20">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Input riset</h2>
                <p className="text-sm text-zinc-400">
                  Isi titik kandidat dan jenis bisnis sebelum menjalankan analisis.
                </p>
              </div>
              <button
                type="button"
                onClick={runResearch}
                disabled={isRunning}
                className="rounded-full bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRunning ? "Menjalankan..." : "Jalankan Riset"}
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Nama bisnis">
                <input
                  value={form.businessName}
                  onChange={(event) => updateField("businessName", event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none transition placeholder:text-zinc-500 focus:border-cyan-400/60 focus:bg-white/8"
                  placeholder="Nama brand"
                />
              </Field>

              <Field label="Jenis bisnis">
                <select
                  value={form.businessType}
                  onChange={(event) => updateField("businessType", event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none transition focus:border-cyan-400/60 focus:bg-white/8"
                >
                  {BUSINESS_TYPES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Segmen harga">
                <select
                  value={form.priceSegment}
                  onChange={(event) => updateField("priceSegment", event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none transition focus:border-cyan-400/60 focus:bg-white/8"
                >
                  {PRICE_SEGMENTS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Mode analisis">
                <select
                  value={form.analysisMode}
                  onChange={(event) => updateField("analysisMode", event.target.value as BusinessInput["analysisMode"])}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none transition focus:border-cyan-400/60 focus:bg-white/8"
                >
                  <option value="deep">Deep</option>
                  <option value="standard">Standard</option>
                </select>
              </Field>

              <Field label="Koordinat">
                <input
                  value={coordinateText}
                  onChange={(event) => updateCoordinateText(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none transition placeholder:text-zinc-500 focus:border-cyan-400/60 focus:bg-white/8"
                  placeholder="-6.3029, 106.9244"
                />
                <p className="text-xs text-zinc-500">Format: latitude, longitude</p>
              </Field>

              <Field label="Standar lokasi">
                <input
                  value={form.locationStandard}
                  onChange={(event) => updateField("locationStandard", event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none transition placeholder:text-zinc-500 focus:border-cyan-400/60 focus:bg-white/8"
                  placeholder="Radius 3 km dari titik kandidat"
                />
              </Field>

              <Field label="Kota / Kabupaten">
                <select
                  value={form.city}
                  onChange={(event) => updateField("city", event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none transition focus:border-cyan-400/60 focus:bg-white/8"
                >
                  <option value="">— Pilih kota (opsional, auto-detect dari koordinat) —</option>
                  {INDONESIA_CITIES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Kecamatan">
                <input
                  value={form.district}
                  onChange={(event) => updateField("district", event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none transition placeholder:text-zinc-500 focus:border-cyan-400/60 focus:bg-white/8"
                  placeholder="Masukkan nama kecamatan"
                />
              </Field>

              <Field label="Kelurahan / Desa">
                <input
                  value={form.subDistrict}
                  onChange={(event) => updateField("subDistrict", event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none transition placeholder:text-zinc-500 focus:border-cyan-400/60 focus:bg-white/8"
                  placeholder="Masukkan nama kelurahan/desa"
                />
              </Field>
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">Parameter riset</h3>
                  <p className="text-xs text-zinc-400">Centang bagian yang ingin ditekankan.</p>
                </div>
                <span className="text-xs text-zinc-500">{form.researchParams.length} terpilih</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {RESEARCH_PARAMS.map((param) => {
                  const active = form.researchParams.includes(param);
                  return (
                    <button
                      key={param}
                      type="button"
                      onClick={() => patchResearchParam(param)}
                      className={[
                        "rounded-full border px-3 py-2 text-xs font-medium transition",
                        active
                          ? "border-cyan-400/40 bg-cyan-400/15 text-cyan-100"
                          : "border-white/10 bg-white/5 text-zinc-300 hover:border-white/20 hover:bg-white/8",
                      ].join(" ")}
                    >
                      {param}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <MiniStat label="Status" value={isRunning ? "Berjalan" : "Siap"} />
              <MiniStat label="Log hidup" value={liveStatus} />
              <MiniStat label="Progress bar" value={`${progress}%`} />
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-[#08111f] p-4">
              <div className="mb-3 flex items-center justify-between text-xs text-zinc-400">
                <span>Progress pipeline</span>
                <span>{completedSteps}/{steps.length} step</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-blue-400 to-violet-400 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {steps.map((step) => (
                  <article
                    key={step.id}
                    className={[
                      "rounded-xl border p-3",
                      step.status === "done"
                        ? "border-emerald-400/25 bg-emerald-400/10"
                        : step.status === "running"
                          ? "border-cyan-400/25 bg-cyan-400/10"
                          : step.status === "error"
                            ? "border-rose-400/25 bg-rose-400/10"
                            : "border-white/8 bg-white/4",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">{step.title}</p>
                        <p className="mt-1 text-xs text-zinc-400">
                          {step.detail ?? "Menunggu giliran"}
                        </p>
                      </div>
                      <span className="text-xs uppercase tracking-[0.18em] text-zinc-400">
                        {step.status}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <div className={[
              "glass-card overflow-hidden border p-6 shadow-xl shadow-black/20",
              verdictTone,
            ].join(" ")}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-zinc-400">Hasil akhir</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">
                    {result?.verdict ?? "Belum ada verdict"}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-300">
                    {result?.verdictReason ??
                      "Jalankan riset dulu."}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-xs text-zinc-400">Skor total</p>
                  <p className="mt-1 text-3xl font-semibold text-white">
                    {result ? `${result.totalScore}/${result.maxTotalScore}` : "--/--"}
                  </p>
                  <p className="text-xs text-zinc-400">{scorePercent}% kelayakan</p>
                </div>
              </div>

              {result ? (
                <div className="mt-5 space-y-4">
                  <InfoCard title="🎯 Rekomendasi Akhir" body={result.recommendation} />
                  <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-white">🤖 Analisis AI Mendalam</h3>
                      <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2 py-0.5 text-xs text-cyan-300">
                        {result.aiAnalysis.length.toLocaleString("id-ID")} karakter
                      </span>
                    </div>
                    <div className="max-h-[600px] overflow-auto rounded-xl border border-white/8 bg-black/30 p-4">
                      <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-6 text-zinc-300">
                        {result.aiAnalysis}
                      </pre>
                    </div>
                  </article>
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-white/4 p-5 text-sm text-zinc-400">
                  Hasil analisis akan muncul di sini setelah API streaming selesai.
                </div>
              )}
            </div>

            {result?.marketSnapshot ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="glass-card border-white/10 bg-[#0b1020]/80 p-6 shadow-xl shadow-black/20">
                  <div className="mb-4">
                    <h3 className="text-base font-semibold text-white">Pendapatan vs pengeluaran</h3>
                    <p className="text-sm text-zinc-400">Perbandingan konservatif dan optimistis.</p>
                  </div>
                  <div className="space-y-3 text-sm">
                    <MetricRow
                      label="Minat pasar"
                      value={`${result.marketSnapshot.demandScore}/100`}
                      note="Skor dari perumahan, pendidikan, dan sinyal digital."
                    />
                    <MetricRow
                      label="Minat area sekitar"
                      value={`${result.marketSnapshot.interestScore}/100`}
                      note="Gabungan promosi, relevansi, dan sentimen."
                    />
                    <MetricRow
                      label="Tekanan kompetisi"
                      value={`${result.marketSnapshot.competitionPressure}/100`}
                      note="Semakin rendah = semakin sedikit kompetitor."
                    />
                    <MetricRow
                      label="Pendapatan bulanan"
                      value={`${formatMoney(result.marketSnapshot.estimatedMonthlyRevenue.low)} - ${formatMoney(result.marketSnapshot.estimatedMonthlyRevenue.high)}`}
                      note={result.marketSnapshot.estimatedMonthlyRevenue.basis}
                    />
                    <MetricRow
                      label="Pengeluaran bulanan"
                      value={`${formatMoney(result.marketSnapshot.estimatedMonthlyExpense.low)} - ${formatMoney(result.marketSnapshot.estimatedMonthlyExpense.high)}`}
                      note={result.marketSnapshot.estimatedMonthlyExpense.basis}
                    />
                    <MetricRow
                      label="Laba bulanan"
                      value={`${formatMoneySigned(result.marketSnapshot.estimatedMonthlyProfit.low)} - ${formatMoneySigned(result.marketSnapshot.estimatedMonthlyProfit.high)}`}
                      note={result.marketSnapshot.estimatedMonthlyProfit.basis}
                    />
                    <MetricRow
                      label="Balik modal"
                      value={result.marketSnapshot.estimatedBreakEvenMonths}
                      note={result.marketSnapshot.estimatedMonthlyCustomers.basis}
                    />
                  </div>
                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
                    {result.marketSnapshot.notes.map((note) => (
                      <p key={note} className="mb-2 last:mb-0">
                        {note}
                      </p>
                    ))}
                  </div>
                </div>

                <div className="glass-card border-white/10 bg-[#0b1020]/80 p-6 shadow-xl shadow-black/20">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-white">Referensi penelitian</h3>
                      <p className="text-sm text-zinc-400">Sumber data yang diverifikasi dari pencarian web.</p>
                    </div>
                    <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2 py-0.5 text-xs text-cyan-300">
                      {result.references.length} sumber
                    </span>
                  </div>
                  <div className="max-h-[500px] space-y-3 overflow-auto pr-1">
                    {result.references.length > 0 ? (
                      result.references.map((ref, i) => {
                        let domain = ref.url;
                        try { domain = new URL(ref.url).hostname.replace("www.", ""); } catch { /* ok */ }
                        return (
                          <a
                            key={ref.url}
                            href={ref.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-cyan-400/40 hover:bg-white/8"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-white leading-5">{ref.title}</p>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-xs text-cyan-300">
                                    {ref.source}
                                  </span>
                                  <span className="text-xs text-zinc-500">{domain}</span>
                                </div>
                              </div>
                              <span className="shrink-0 text-xs text-zinc-500">#{i + 1}</span>
                            </div>
                            {ref.snippet && (
                              <p className="mt-2 text-xs leading-5 text-zinc-400 line-clamp-3">
                                {ref.snippet.slice(0, 200)}
                              </p>
                            )}
                          </a>
                        );
                      })
                    ) : (
                      <p className="text-sm text-zinc-400">Belum ada referensi yang berhasil dikumpulkan.</p>
                    )}
                  </div>
                </div>
              </div>
            ) : null}



            <div className="grid gap-4 md:grid-cols-2">
              <div className="glass-card border-white/10 bg-[#0b1020]/80 p-6 shadow-xl shadow-black/20">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-white">Parameter scoring</h3>
                    <p className="text-sm text-zinc-400">Bobot utama untuk evaluasi lokasi.</p>
                  </div>
                  <span className="text-xs text-zinc-500">{scoreItems.length} item</span>
                </div>
                <div className="space-y-3">
                  {scoreItems.length > 0 ? (
                    scoreItems.map((item) => {
                      const width = `${Math.round((item.score / item.maxScore) * 100)}%`;
                      return (
                        <div key={item.parameter} className="rounded-xl border border-white/10 bg-white/4 p-3">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <p className="text-sm font-medium text-white">{item.parameter}</p>
                              <p className="text-xs text-zinc-400">{item.details}</p>
                            </div>
                            <span className="text-sm font-semibold text-cyan-200">
                              {item.score}/{item.maxScore}
                            </span>
                          </div>
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/5">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400"
                              style={{ width }}
                            />
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-sm text-zinc-400">
                      Belum ada skor. Jalankan riset untuk menampilkan pembobotan parameter.
                    </p>
                  )}
                </div>
              </div>

              <div className="glass-card border-white/10 bg-[#0b1020]/80 p-6 shadow-xl shadow-black/20">
                <div className="mb-4">
                  <h3 className="text-base font-semibold text-white">Stream monitor</h3>
                  <p className="text-sm text-zinc-400">Ringkasan data yang datang dari endpoint.</p>
                </div>

                <div className="space-y-3 text-sm">
                  <SummaryLine label="Kelurahan" value={String(kelurahanCount)} />
                  <SummaryLine label="Jejak digital" value={String(digitalCount)} />
                  <SummaryLine label="Titik koordinat" value={`${form.coordinates.lat}, ${form.coordinates.lng}`} />
                </div>

                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-white">Log performa</h4>
                      <p className="text-xs text-zinc-500">Tahap paling lambat akan muncul di sini.</p>
                    </div>
                    <span className="text-xs text-zinc-500">{logs.length} baris</span>
                  </div>
                  <div className="max-h-56 space-y-2 overflow-auto pr-1 text-xs leading-5 text-zinc-300">
                    {logs.length > 0 ? (
                      logs.map((log, index) => (
                        <p
                          key={`${index}-${log}`}
                          className="rounded-lg border border-white/8 bg-white/4 px-3 py-2 font-mono"
                        >
                          {log}
                        </p>
                      ))
                    ) : (
                      <p className="text-zinc-500">Belum ada log. Jalankan riset untuk melihat timing.</p>
                    )}
                  </div>
                </div>

                {error ? (
                  <div className="mt-4 rounded-2xl border border-rose-400/25 bg-rose-500/10 p-4 text-sm text-rose-100">
                    {error}
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-medium uppercase tracking-[0.24em] text-zinc-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-zinc-400">{hint}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">{label}</p>
      <p className="mt-2 text-sm font-medium leading-5 text-white">{value}</p>
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/4 px-4 py-3">
      <span className="text-zinc-400">{label}</span>
      <span className="max-w-[55%] truncate text-right font-medium text-white">{value}</span>
    </div>
  );
}

function MetricRow({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-start justify-between gap-3">
        <span className="text-zinc-400">{label}</span>
        <span className="text-right font-semibold text-white">{value}</span>
      </div>
      <p className="mt-2 text-xs leading-5 text-zinc-500">{note}</p>
    </div>
  );
}

function InfoCard({ title, body }: { title: string; body: string }) {
  const safeBody = typeof body === "string" ? body : JSON.stringify(body, null, 2);
  return (
    <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <pre className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-300">
        {safeBody}
      </pre>
    </article>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMoneySigned(value: number) {
  return value < 0 ? `-${formatMoney(Math.abs(value))}` : formatMoney(value);
}
