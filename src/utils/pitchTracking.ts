// utils/pitchTracking.ts
/**
 * Упрощенная версия алгоритма YIN для оценки основного тона (pitch-tracking).
 * Реализация адаптирована для работы в браузере и оптимизирована для быстрой работы.
 */
export async function yinPitchTracking(
  audioContext: AudioContext,
  buffer: AudioBuffer,
  onProgress?: (p: number) => void
): Promise<Array<{ frequency: number; probability: number }>> {
  // Получаем данные из буфера
  const x = buffer.getChannelData(0);
  const N = x.length;
  const sampleRate = audioContext.sampleRate;
  
  // Определяем диапазон поиска частот (от 50 Гц до 1000 Гц)
  const tauMax = Math.floor(sampleRate / 50);    // минимум 50 Гц
  const tauMin = Math.floor(sampleRate / 1000);  // максимум 1000 Гц
  
  // Массив для хранения функции разности
  const d = new Float32Array(tauMax);
  
  try {
    // 1) Разность квадратичных сумм (основной шаг YIN алгоритма)
    for (let tau = tauMin; tau < tauMax; tau++) {
      let sum = 0;
      
      // Оптимизированный расчет функции разности
      // Мы берем только каждую 8-ю точку для ускорения
      // На качество определения основной частоты это влияет несущественно
      for (let i = 0; i < N - tau; i += 8) {
        const diff = x[i] - x[i + tau];
        sum += diff * diff;
      }
      
      d[tau] = sum;
      
      // Если есть функция обратного вызова для прогресса, вызываем её
      if (onProgress && tau % 100 === 0) {
        onProgress(Math.round(((tau - tauMin) / (tauMax - tauMin)) * 100));
      }
    }
    
    // 2) Нормализация (Cumulative Mean Normalized Difference Function)
    const cmndf = new Float32Array(tauMax);
    cmndf[0] = 1;
    let runningSum = 0;
    
    for (let tau = 1; tau < tauMax; tau++) {
      runningSum += d[tau];
      if (runningSum === 0) {
        cmndf[tau] = 1; // Избегаем деления на ноль
      } else {
        cmndf[tau] = d[tau] * tau / runningSum;
      }
    }
    
    // 3) Поиск первого минимума
    // Изначально предполагаем, что минимум находится в начале диапазона
    let bestTau = tauMin;
    let bestVal = cmndf[tauMin];
    
    // Используем порог для определения "достаточно хорошего" минимума
    const threshold = 0.1; // Настраиваемый параметр
    
    // Поиск первого значения ниже порога
    for (let tau = tauMin; tau < tauMax; tau++) {
      if (cmndf[tau] < threshold) {
        // Нашли точку ниже порога, теперь ищем локальный минимум вокруг нее
        bestTau = tau;
        bestVal = cmndf[tau];
        
        // Ищем более глубокий минимум в ближайшей окрестности
        for (let i = tau + 1; i < Math.min(tau + 10, tauMax); i++) {
          if (cmndf[i] < bestVal) {
            bestTau = i;
            bestVal = cmndf[i];
          } else if (cmndf[i] > bestVal * 1.2) {
            // Если значение резко выросло, прекращаем поиск
            break;
          }
        }
        
        // Прекращаем общий поиск, так как нашли хороший минимум
        break;
      }
    }
    
    // Если не нашли точку ниже порога, ищем абсолютный минимум
    if (bestTau === tauMin) {
      for (let tau = tauMin + 1; tau < tauMax; tau++) {
        if (cmndf[tau] < bestVal) {
          bestTau = tau;
          bestVal = cmndf[tau];
        }
      }
    }
    
    // Уточнение частоты с помощью параболической интерполяции
    let refinedTau = bestTau;
    
    if (bestTau > tauMin && bestTau < tauMax - 1) {
      const y1 = cmndf[bestTau - 1];
      const y2 = cmndf[bestTau];
      const y3 = cmndf[bestTau + 1];
      
      // Параболическая интерполяция
      const a = (y1 + y3 - 2 * y2) / 2;
      if (a !== 0) {
        const b = (y3 - y1) / 2;
        const correction = -b / (2 * a);
        
        // Применяем коррекцию только если она разумная
        if (Math.abs(correction) < 1) {
          refinedTau = bestTau + correction;
        }
      }
    }
    
    const frequency = sampleRate / refinedTau;
    const probability = 1 - bestVal; // Вероятность наличия периодичности
    
    return [{ frequency, probability }];
  } catch (error) {
    console.error("Ошибка в алгоритме YIN:", error);
    return [{ frequency: 0, probability: 0 }];
  }
}

/**
 * Упрощенная версия YIN алгоритма, которая работает быстрее,
 * но с меньшей точностью в определении частоты.
 */
export async function fastPitchTracking(
  audioData: Float32Array,
  sampleRate: number
): Promise<Array<{ frequency: number; probability: number }>> {
  // Берем только первые 4096 сэмплов для быстрой работы
  const bufferSize = Math.min(audioData.length, 4096);
  const buffer = audioData.slice(0, bufferSize);
  
  // Определяем диапазон поиска частот (от 80 Гц до 800 Гц)
  const tauMax = Math.floor(sampleRate / 80);
  const tauMin = Math.floor(sampleRate / 800);
  
  // Автокорреляция
  const acf = new Float32Array(tauMax);
  
  // Вычисляем автокорреляцию
  for (let tau = 0; tau < tauMax; tau++) {
    let sum = 0;
    let count = 0;
    
    // Используем прореживание для ускорения
    for (let i = 0; i < bufferSize - tau; i += 4) {
      sum += buffer[i] * buffer[i + tau];
      count++;
    }
    
    acf[tau] = sum / count;
  }
  
  // Нормализуем автокорреляцию
  const maxAcf = acf[0];
  if (maxAcf !== 0) {
    for (let i = 0; i < tauMax; i++) {
      acf[i] /= maxAcf;
    }
  }
  
  // Ищем первый пик после tauMin
  let peakValue = -1;
  let peakTau = 0;
  
  for (let tau = tauMin; tau < tauMax; tau++) {
    // Пик - это точка, которая выше своих соседей
    if (acf[tau] > acf[tau - 1] && acf[tau] > acf[tau + 1] && acf[tau] > 0.5) {
      if (acf[tau] > peakValue) {
        peakValue = acf[tau];
        peakTau = tau;
        
        // Если нашли очень хороший пик, можно остановиться
        if (peakValue > 0.9) break;
      }
    }
  }
  
  if (peakTau > 0) {
    return [{
      frequency: sampleRate / peakTau,
      probability: peakValue
    }];
  }
  
  return [{ frequency: 0, probability: 0 }];
}