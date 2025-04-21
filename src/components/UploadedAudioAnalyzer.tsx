// components/UploadedAudioAnalyzer.tsx
"use client";

import React, { useCallback, useRef, useState } from "react";
import {
  createAudioContext,
  analyzeAudioSpectrum,
  medianSmoothSpectrogram,
  synthesizeFromHarmonics,
  createAudioBufferFromWave,
  playAudioBuffer
} from "@/utils/audioUtils";
import { yinPitchTracking } from "@/utils/pitchTracking";
import { SpectralPoint } from "@/utils/fourierTransform";
import SpectrumChart from "@/components/common/SpectrumChart";

interface UploadedAudioAnalyzerProps {
  maxFrequency?: number;
  chartHeight?: number | string;
}

const UploadedAudioAnalyzer: React.FC<UploadedAudioAnalyzerProps> = ({
  maxFrequency = 5000,
  chartHeight = 360,
}) => {
  const [spectrum, setSpectrum] = useState<SpectralPoint[]>([]);
  const [detectedNotes, setDetectedNotes] = useState<
    Array<{ note: string; frequency: number; cents: number; amplitude: number }>
  >([]);
  const [yinResult, setYinResult] = useState<
    Array<{ frequency: number; probability: number }>
  >([]);
  const [progress, setProgress] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");

  const audioCtxRef = useRef<AudioContext | null>(null);
  const originalBufRef = useRef<AudioBuffer | null>(null);
  const harmonicsBufRef = useRef<AudioBuffer | null>(null);
  const [sourceNode, setSourceNode] = useState<AudioBufferSourceNode | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setError("");
    setProcessing(true);
    setProgress(0);
    setFileName(file.name);

    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = createAudioContext();
        if (!audioCtxRef.current) {
          throw new Error("Web Audio API не поддерживается");
        }
      }
      const ctx = audioCtxRef.current;
      const array = await file.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(array);
      originalBufRef.current = audioBuffer;

      // Параллельно FFT и YIN
      const [fftRes, yinRes] = await Promise.all([
        analyzeAudioSpectrum(ctx, audioBuffer, 8192, { onProgress: setProgress }),
        yinPitchTracking(ctx, audioBuffer, setProgress),
      ]);

      // Формируем спектр и сглаживаем
      const raw: SpectralPoint[] = Array.from(fftRes.frequencyData).map((a, i) => ({
        harmonic: i,
        frequency: i * fftRes.frequencyResolution,
        amplitude: a,
      }));
      const smooth = medianSmoothSpectrogram(raw, 7);
      setSpectrum(smooth);
      setYinResult(yinRes);

      // Синтез по первым 10 гармоникам
      const peaks = smooth
        .sort((a, b) => b.amplitude - a.amplitude)
        .slice(0, 10)
        .map(p => ({ frequency: p.frequency, amplitude: p.amplitude }));
      const harmonicsBuffer = synthesizeFromHarmonics(
        ctx,
        peaks,
        audioBuffer.duration,
        "sine"
      );
      harmonicsBufRef.current = harmonicsBuffer;

      // Идентификация «ноты» для таблицы
      const detected = peaks.map(p => {
        const cents =
          yinRes.length > 0
            ? Math.round(
                1200 * Math.log2(p.frequency / yinRes[0].frequency)
              )
            : 0;
        return {
          note: `${p.frequency.toFixed(1)} Hz`,
          frequency: p.frequency,
          cents,
          amplitude: p.amplitude,
        };
      });
      setDetectedNotes(detected);
    } catch (e: any) {
      setError(e.message || "Ошибка при обработке файла");
    } finally {
      setProcessing(false);
      setProgress(100);
    }
  }, [maxFrequency]);

  const stopPlayback = useCallback(() => {
    if (sourceNode) {
      try {
        sourceNode.stop();
      } catch {}
      setSourceNode(null);
    }
  }, [sourceNode]);

  const playOriginal = useCallback(() => {
    stopPlayback();
    const ctx = audioCtxRef.current;
    const buf = originalBufRef.current;
    if (!ctx || !buf) return;
    const src = playAudioBuffer(ctx, buf, () => setSourceNode(null), 0.5);
    setSourceNode(src);
  }, [stopPlayback]);

  const playHarmonics = useCallback(() => {
    stopPlayback();
    const ctx = audioCtxRef.current;
    const buf = harmonicsBufRef.current;
    if (!ctx || !buf) return;
    const src = playAudioBuffer(ctx, buf, () => setSourceNode(null), 0.5);
    setSourceNode(src);
  }, [stopPlayback]);

  const isPlaying = Boolean(sourceNode);

  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold mb-3">Загрузка аудио</h2>
      <label
        className={`inline-block cursor-pointer bg-[var(--primary)] text-white py-2 px-4 rounded-md ${
          processing ? "opacity-50 pointer-events-none" : ""
        }`}
      >
        Выбрать файл
        <input
          type="file"
          accept="audio/*"
          className="hidden"
          disabled={processing}
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
      </label>
      {fileName && <p className="mt-2 text-sm text-gray-600">Файл: {fileName}</p>}
      {processing && (
        <div className="w-full bg-gray-200 h-2 rounded mt-2 overflow-hidden">
          <div
            className="bg-blue-500 h-2"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      {error && <p className="mt-3 text-red-600">{error}</p>}

      {spectrum.length > 0 && (
        <div className="mt-6 bg-white p-4 border rounded-lg shadow">
          <SpectrumChart
            data={spectrum}
            title="Спектр"
            height={chartHeight}
            yAxisLabel="Амплитуда"
            xAxisLabel="Частота (Гц)"
            maxDisplayPoints={120}
            useLogScale={false}
          />
        </div>
      )}

      {yinResult.length > 0 && (
        <div className="mt-4 p-4 bg-gray-50 border rounded">
          <strong>YIN Pitch:</strong>
          {yinResult.map((r, i) => (
            <span key={i} className="ml-2">
              {r.frequency.toFixed(1)} Hz ({(r.probability * 100).toFixed(1)}%)
            </span>
          ))}
        </div>
      )}

      {detectedNotes.length > 0 && (
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium">Нота</th>
                <th className="px-4 py-2 text-left text-xs font-medium">
                  Частота
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium">
                  Отклонение
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium">
                  Амплитуда
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200 text-sm">
              {detectedNotes.map((n, idx) => (
                <tr key={idx}>
                  <td className="px-4 py-2">{n.note}</td>
                  <td className="px-4 py-2">{n.frequency.toFixed(1)}</td>
                  <td className="px-4 py-2">
                    {n.cents >= 0 ? `+${n.cents}` : n.cents}
                  </td>
                  <td className="px-4 py-2">{n.amplitude.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(originalBufRef.current || harmonicsBufRef.current) && (
        <div className="mt-6 flex space-x-4">
          <button
            className="py-2 px-4 bg-green-500 text-white rounded disabled:opacity-50"
            onClick={playOriginal}
            disabled={processing || isPlaying || !originalBufRef.current}
          >
            Оригинал
          </button>
          <button
            className="py-2 px-4 bg-blue-500 text-white rounded disabled:opacity-50"
            onClick={playHarmonics}
            disabled={processing || isPlaying || !harmonicsBufRef.current}
          >
            Только гармоники
          </button>
          <button
            className="py-2 px-4 bg-red-500 text-white rounded disabled:opacity-50"
            onClick={stopPlayback}
            disabled={!isPlaying}
          >
            Стоп
          </button>
        </div>
      )}
    </section>
  );
};

export default UploadedAudioAnalyzer;
