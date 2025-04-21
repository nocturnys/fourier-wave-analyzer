// utils/pitchTracking.ts
/**
 * Алгоритм YIN для оценки основного тона (pitch‑tracking).
 */
export async function yinPitchTracking(
    audioContext: AudioContext,
    buffer: AudioBuffer,
    onProgress?: (p: number) => void
  ): Promise<Array<{ frequency: number; probability: number }>> {
    const x = buffer.getChannelData(0);
    const N = x.length;
    const sampleRate = audioContext.sampleRate;
    const tauMax = Math.floor(sampleRate / 50);    // минимум 50 Гц
    const tauMin = Math.floor(sampleRate / 1000);  // максимум 1000 Гц
    const d = new Float32Array(tauMax);
  
    // 1) Разность квадратичных сумм
    for (let tau = tauMin; tau < tauMax; tau++) {
      let sum = 0;
      for (let i = 0; i < N - tau; i++) {
        const diff = x[i] - x[i + tau];
        sum += diff * diff;
      }
      d[tau] = sum;
      if (onProgress && tau % 100 === 0) {
        onProgress(Math.round(((tau - tauMin) / (tauMax - tauMin)) * 100));
      }
    }
  
    // 2) Нормализация (CMNDF)
    const cmndf = new Float32Array(tauMax);
    cmndf[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau < tauMax; tau++) {
      runningSum += d[tau];
      cmndf[tau] = d[tau] * tau / runningSum;
    }
  
    // 3) Поиск первого минимума
    let bestTau = tauMin;
    for (let tau = tauMin + 1; tau < tauMax; tau++) {
      if (cmndf[tau] < cmndf[bestTau]) {
        bestTau = tau;
      }
    }
  
    const frequency = sampleRate / bestTau;
    const probability = 1 - cmndf[bestTau];
    return [{ frequency, probability }];
  }
  