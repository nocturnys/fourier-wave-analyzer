"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  generateSineWave, 
  generateSquareWave, 
  generateSawtoothWave, 
  generateTriangleWave, 
  WavePoint 
} from '@/utils/waveGenerators';
import { 
  calculateFourierCoefficients, 
  reconstructWaveFromFourier, 
  prepareSpectralData,
  FourierCoefficients,
  SpectralPoint,
  calculateReconstructionAccuracy
} from '@/utils/fourierTransform';
import { createAudioBufferFromWave, playAudioBuffer } from '@/utils/audioUtils';
import { WAVE_TYPES, SAMPLE_RATE, DEFAULT_DURATION } from '@/constants/audioConstants';
import Plot from 'react-plotly.js';
import { Layout, Data, Config } from 'plotly.js';

// Cache for reconstructions
const reconstructionCache = new Map<string, WavePoint[]>();

/**
 * Creates a cache key for reconstructions
 */
const createReconstructionCacheKey = (
  coefficients: FourierCoefficients, 
  duration: number, 
  frequency: number, 
  harmonics: number
): string => {
  // Use hash of coefficients for more compact key
  const a0Hash = coefficients.a0.toFixed(2);
  const aHash = coefficients.a.length > 0 ? 
    coefficients.a.slice(0, 3).map(v => v.toFixed(1)).join('_') : '0';
  const bHash = coefficients.b.length > 0 ? 
    coefficients.b.slice(0, 3).map(v => v.toFixed(1)).join('_') : '0';
  
  return `recon_${a0Hash}_${aHash}_${bHash}_${duration.toFixed(3)}_${frequency}_${harmonics}`;
};

// Helper debounce function (using arrow function)
// Fix: Specify function signature type more accurately
const debounce = <F extends (...args: Parameters<F>) => void>(func: F, wait: number): ((...args: Parameters<F>) => void) => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<F>): void => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timeoutId = null;
      func(...args);
    }, wait);
  };
};

/**
 * WaveAnalyzer component - An interactive tool for analyzing sound waves and their Fourier transforms
 */
const WaveAnalyzer: React.FC = () => {
  // State for wave parameters
  const [waveType, setWaveType] = useState<string>(WAVE_TYPES.SINE);
  const [frequency, setFrequency] = useState<number>(440);
  const [amplitude, setAmplitude] = useState<number>(10000);
  const [duration, setDuration] = useState<number>(DEFAULT_DURATION);
  const [numHarmonics, setNumHarmonics] = useState<number>(10);
  const [volume, setVolume] = useState<number>(0.5);
  
  // State for analysis data
  const [waveData, setWaveData] = useState<WavePoint[]>([]);
  const [reconstructedWave, setReconstructedWave] = useState<WavePoint[]>([]);
  const [fourierCoefficients, setFourierCoefficients] = useState<FourierCoefficients>({ 
    a0: 0, 
    a: [], 
    b: [] 
  });
  const [spectralData, setSpectralData] = useState<SpectralPoint[]>([]);
  
  // State for audio playback
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  
  // State for showing enhanced spectral visualization
  const [useLogScale, setUseLogScale] = useState<boolean>(false);
  
  // State for multiple harmonics reconstructions
  const [multiHarmonicReconstructions, setMultiHarmonicReconstructions] = useState<Array<{
    data: WavePoint[];
    harmonics: number;
  }>>([]);
  
  // Refs for Web Audio API objects
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

  interface CombinedWavePoint {
    t: number;
    original: number;
    [key: string]: number; // Это позволит иметь динамические свойства вида harmonic_1, harmonic_2, и т.д.
  }

  // Debounce settings
  const DEBOUNCE_DELAY = 300; // milliseconds

  // Wrap SCIENTIFIC_COLORS in useMemo
  const SCIENTIFIC_COLORS = useMemo(() => ({
    primary: '#4169E1',      
    secondary: '#228B22',    
    highlight: '#FF7F00',    
    accent: '#9932CC',       
    contrast: '#CD5C5C',     
    neutral: '#555555',      
  }), []);
  
  // Функция для прямой генерации данных волны для отображения, с плавными аппроксимациями
  const generateCombinedWaveData = useCallback(() => {
    // Определяем количество точек для плавного отображения
    const pointCount = 1000;
    const timeRange = duration;
    
    const result: CombinedWavePoint[] = [];
    
    for (let i = 0; i < pointCount; i++) {
      const t = (i / pointCount) * timeRange;
      const angle = 1.5 + 2 * Math.PI * frequency * t;
      const angle2 = 2 * Math.PI * frequency * t;
      
      // Вычисляем оригинальное значение сигнала
      let originalValue: number = 0;
      
      if (waveType === WAVE_TYPES.SINE) {
        originalValue = amplitude * Math.sin(angle);
      } else if (waveType === WAVE_TYPES.SQUARE) {
        originalValue = amplitude * (Math.sin(angle) >= 0 ? 1 : -1);
      } else if (waveType === WAVE_TYPES.SAWTOOTH) {
        // Важно! Формула пилообразной волны должна быть синхронизирована с аппроксимацией
        const normalized = (t * frequency) % 1;
        originalValue = amplitude * (2 * normalized - 1);
      } else if (waveType === WAVE_TYPES.TRIANGLE) {
        // Важно! Формула треугольной волны должна быть синхронизирована с аппроксимацией
        const normalized = (t * frequency) % 1;
        originalValue = amplitude * (normalized < 0.5 
          ? (4 * normalized - 1) 
          : (3 - 4 * normalized));
      }
      
      // Создаем объект с точкой времени и оригинальным значением
      const point: CombinedWavePoint = { t, original: originalValue };
      
      // Добавляем аппроксимации для разных уровней гармоник
      const harmonicLevels = [1, 3, 5, 10, 20, numHarmonics];
      const uniqueLevels = [...new Set(harmonicLevels)].sort((a, b) => a - b);
      
      uniqueLevels.forEach(harmCount => {
        // Рассчитываем аппроксимацию напрямую по формулам Фурье
        let approximatedValue: number = 0;
        
        if (waveType === WAVE_TYPES.SINE) {
          // Синусоида точно представляется одной гармоникой
          approximatedValue = harmCount >= 1 ? originalValue : 0;
        } 
        else if (waveType === WAVE_TYPES.SQUARE) {
          // Прямоугольная волна: сумма нечетных гармоник
          for (let n = 1; n <= harmCount * 2; n += 2) {
            approximatedValue += (4 * amplitude / (n * Math.PI)) * 
                                Math.sin(n * angle);
          }
        } 
        else if (waveType === WAVE_TYPES.SAWTOOTH) {
          // Пилообразная волна: сумма всех гармоник
          // ИСПРАВЛЕНИЕ: Убираем сдвиг фазы -Math.PI/2, который вызывал рассинхронизацию
          for (let n = 1; n <= harmCount; n++) {
            approximatedValue += (2 * amplitude / (n * Math.PI)) * 
                                Math.sin(n * angle2) * -1;
          }
        } 
        else if (waveType === WAVE_TYPES.TRIANGLE) {
          // Треугольная волна: сумма нечетных гармоник с быстрым убыванием
          for (let n = 1; n <= harmCount * 2; n += 2) {
            const sign = -Math.pow(-1, (n - 1) / 2); // Инвертируем знак функции
            approximatedValue += (8 * amplitude / Math.pow(n * Math.PI, 2)) * 
                                Math.sin(n * angle) * sign;
          }
        }
        
        // Добавляем значение для этого уровня гармоник
        point[`harmonic_${harmCount}`] = approximatedValue;
      });
      
      result.push(point);
    }
    
    return result;
  }, [waveType, frequency, amplitude, duration, numHarmonics]);
  
  // Используем новый метод генерации данных для комбинированного отображения
  const combinedWaveData = useMemo(() => {
    return generateCombinedWaveData();
  }, [generateCombinedWaveData]);
  
  // Get explanation text for current wave type
  const waveExplanation = useMemo(() => {
    switch (waveType) {
      case WAVE_TYPES.SQUARE:
        return 'Прямоугольная волна содержит только нечётные гармоники (1, 3, 5, ...) с амплитудами, убывающими как 1/n. Для точного воспроизведения резких переходов теоретически требуется бесконечное число гармоник.';
      case WAVE_TYPES.SAWTOOTH:
        return 'Пилообразная волна содержит все гармоники (чётные и нечётные) с амплитудами, убывающими как 1/n. Требует большого числа гармоник для точного воспроизведения резкого перехода.';
      case WAVE_TYPES.TRIANGLE:
        return 'Треугольная волна содержит только нечётные гармоники (1, 3, 5, ...) с амплитудами, убывающими как 1/n². Благодаря более быстрому убыванию амплитуд, аппроксимация сходится быстрее, чем для прямоугольной волны.';
      default:
        return 'Синусоида является базовой гармоникой и полностью описывается одной частотой. Это единственная форма волны, которая содержит только одну гармонику.';
    }
  }, [waveType]);
  
  // Highlighted harmonics based on wave type
  const getHighlightedHarmonics = useCallback((): number[] => {
    switch (waveType) {
      case WAVE_TYPES.SQUARE:
        return [1, 3, 5, 7, 9];
      case WAVE_TYPES.SAWTOOTH:
        return [1, 2, 3, 4, 5];
      case WAVE_TYPES.TRIANGLE:
        return [1, 3, 5, 9];
      default:
        return [1];
    }
  }, [waveType]);
  
  // --- Core Logic Functions (memoized) ---

  // Update reconstructed wave logic (depends on coefficients and parameters)
  const updateReconstructedWave = useCallback((
    coefficients: FourierCoefficients,
    harmonicCount: number,
    currentDuration: number,
    currentFrequency: number
  ) => {
    // console.log(`Attempting to update reconstruction with ${harmonicCount} harmonics...`);
    const cacheKey = createReconstructionCacheKey(
      coefficients,
      currentDuration,
      currentFrequency,
      harmonicCount
    );

    let reconstructed: WavePoint[];

    if (reconstructionCache.has(cacheKey)) {
      reconstructed = reconstructionCache.get(cacheKey)!;
      // console.log("Reconstruction cache hit.");
    } else {
      // console.log("Reconstruction cache miss, calculating...");
      reconstructed = reconstructWaveFromFourier(
        coefficients,
        currentDuration,
        currentFrequency,
        harmonicCount
      );
      reconstructionCache.set(cacheKey, reconstructed);
    }

    // console.log("Reconstruction update complete.");
    setReconstructedWave(reconstructed); // Update state
  }, []); // No dependencies needed here as it's just logic, state is passed in


  // Generate the wave and its Fourier analysis
  const generateWave = useCallback(() => {
    // console.log("Attempting to generate wave...");
    let data: WavePoint[] = [];

    // Generate the appropriate wave type
    switch (waveType) {
      case WAVE_TYPES.SINE:
        data = generateSineWave(frequency, amplitude, duration);
        break;
      case WAVE_TYPES.SQUARE:
        data = generateSquareWave(frequency, amplitude, duration);
        break;
      case WAVE_TYPES.SAWTOOTH:
        data = generateSawtoothWave(frequency, amplitude, duration);
        break;
      case WAVE_TYPES.TRIANGLE:
        data = generateTriangleWave(frequency, amplitude, duration);
        break;
      default:
        data = generateSineWave(frequency, amplitude, duration);
    }
    // console.log("Wave generation complete.");
    setWaveData(data);

    // Calculate Fourier coefficients
    const coefficients = calculateFourierCoefficients(data, 50); // Increased number of calculated coefficients for accuracy
    setFourierCoefficients(coefficients);

    // Update reconstruction based on newly generated wave and coefficients
    updateReconstructedWave(coefficients, numHarmonics, duration, frequency);

    // Prepare spectral data
    const spectral = prepareSpectralData(coefficients, frequency);
    setSpectralData(spectral);

  }, [waveType, frequency, amplitude, duration, numHarmonics, updateReconstructedWave]); // Include all state dependencies and updateReconstructedWave

  // --- Debounced Handlers ---

  // Debounced version of generateWave trigger
  const debouncedGenerateWave = useMemo(
    () => debounce(generateWave, DEBOUNCE_DELAY),
    [generateWave] // Recreate debounce wrapper if generateWave implementation changes
  );

  // Debounced version of updateReconstructedWave trigger
  const debouncedUpdateReconstruction = useMemo(
    () => debounce((newHarmonics: number) => {
        // We need the *current* coefficients, duration, frequency when the debounced function executes
        // Passing them directly might capture stale state.
        // Instead, we pass the newHarmonics value and let updateReconstructedWave access current state.
        // But updateReconstructedWave isn't a state setter, it needs the state values passed in.
        // Let's pass the stateful values into the debounced function call.
        updateReconstructedWave(fourierCoefficients, newHarmonics, duration, frequency);
    }, DEBOUNCE_DELAY),
    [updateReconstructedWave, fourierCoefficients, duration, frequency] // Dependencies needed inside the debounced function
  );

  // Effect for creating multiple harmonic reconstructions
  useEffect(() => {
    if (fourierCoefficients.a.length > 0 || fourierCoefficients.b.length > 0 || fourierCoefficients.a0 !== 0) {
      const harmonicLevels = [1, 3, 5, 10, 20, numHarmonics];
      // Убираем дубликаты
      const uniqueLevels = [...new Set(harmonicLevels)].sort((a, b) => a - b);
      
      // Создаем реконструкции для каждого уровня гармоник
      const reconstructions = uniqueLevels.map(harmonics => {
        // Используем кэш, если возможно
        const cacheKey = createReconstructionCacheKey(
          fourierCoefficients, 
          duration, 
          frequency, 
          harmonics
        );
        
        let data: WavePoint[];
        if (reconstructionCache.has(cacheKey)) {
          data = reconstructionCache.get(cacheKey)!;
        } else {
          data = reconstructWaveFromFourier(
            fourierCoefficients, 
            duration, 
            frequency, 
            harmonics
          );
          reconstructionCache.set(cacheKey, data);
        }
        
        return { data, harmonics };
      });
      
      setMultiHarmonicReconstructions(reconstructions);
    }
  }, [fourierCoefficients, duration, frequency, numHarmonics]);

  // --- Effects ---

  // Effect for generating wave on parameter changes
  useEffect(() => {
    debouncedGenerateWave();
  }, [waveType, frequency, amplitude, duration, debouncedGenerateWave]); // Keep debouncedGenerateWave dependency

  // Effect for updating reconstruction when numHarmonics changes
  useEffect(() => {
    if (fourierCoefficients.a.length > 0 || fourierCoefficients.b.length > 0 || fourierCoefficients.a0 !== 0) {
       debouncedUpdateReconstruction(numHarmonics);
    }
  }, [numHarmonics, debouncedUpdateReconstruction, fourierCoefficients]);

  // Initial generation on mount
  useEffect(() => {
    generateWave(); 
  }, [generateWave]); // Fix: Add generateWave as dependency

  // Cleanup effect
  useEffect(() => {
    return () => {
      if (sourceNodeRef.current) {
        sourceNodeRef.current.stop();
        sourceNodeRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // --- Handlers ---
  const handleFrequencyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFrequency(Number(e.target.value));
  };

  const handleAmplitudeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmplitude(Number(e.target.value));
  };

  const handleHarmonicsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNumHarmonics(Number(e.target.value));
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(Number(e.target.value));
  };

  // Play original or reconstructed sound
  const playSound = useCallback(async (isOriginal: boolean): Promise<void> => {
    setError('');
    
    try {
      // Initialize audio context if needed
      if (!audioContextRef.current) {
        if (typeof window === 'undefined') {
          setError('Браузерное окружение недоступно');
          return;
        }
        
        // Corrected AudioContext initialization
        const AudioContextClass = window.AudioContext; // Use standard AudioContext
        if (!AudioContextClass) {
          setError('Web Audio API не поддерживается в этом браузере');
          return;
        }
        
        audioContextRef.current = new AudioContextClass();
      }
      
      const audioContext = audioContextRef.current;
      
      // Resume audio context if needed
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      
      // Stop any current playback
      if (sourceNodeRef.current) {
        sourceNodeRef.current.stop();
        sourceNodeRef.current = null;
      }
      
      // Generate playback data
      const playbackDuration = 1.0; // 1 second
      let dataToPlay: WavePoint[];
      
      if (isOriginal) {
        switch (waveType) {
          case WAVE_TYPES.SINE:
            dataToPlay = generateSineWave(frequency, amplitude, playbackDuration);
            break;
          case WAVE_TYPES.SQUARE:
            dataToPlay = generateSquareWave(frequency, amplitude, playbackDuration);
            break;
          case WAVE_TYPES.SAWTOOTH:
            dataToPlay = generateSawtoothWave(frequency, amplitude, playbackDuration);
            break;
          case WAVE_TYPES.TRIANGLE:
            dataToPlay = generateTriangleWave(frequency, amplitude, playbackDuration);
            break;
          default:
            dataToPlay = generateSineWave(frequency, amplitude, playbackDuration);
        }
      } else {
        const cacheKey = createReconstructionCacheKey(
          fourierCoefficients, 
          playbackDuration, 
          frequency, 
          numHarmonics
        );
        
        if (reconstructionCache.has(cacheKey)) {
          dataToPlay = reconstructionCache.get(cacheKey)!;
        } else {
          dataToPlay = reconstructWaveFromFourier(
            fourierCoefficients, 
            playbackDuration, 
            frequency, 
            numHarmonics
          );
          reconstructionCache.set(cacheKey, dataToPlay);
        }
      }
      
      // Create audio buffer
      const buffer = createAudioBufferFromWave(audioContext, dataToPlay, playbackDuration);
      
      // Play sound
      sourceNodeRef.current = playAudioBuffer(audioContext, buffer, () => {
        setIsPlaying(false);
        sourceNodeRef.current = null;
      }, volume); // Pass the volume parameter here
      
      setIsPlaying(true);
      
      // Auto-stop after 2 seconds
      setTimeout(() => {
        if (sourceNodeRef.current) {
          sourceNodeRef.current.stop();
          sourceNodeRef.current = null;
          setIsPlaying(false);
        }
      }, 2000);
      
    } catch (error) {
      console.error('Error playing sound:', error);
      setError(`Ошибка воспроизведения: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
      setIsPlaying(false);
    }
  }, [waveType, frequency, amplitude, fourierCoefficients, numHarmonics, volume]);
  
  // Stop playback
  const stopSound = useCallback((): void => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
        sourceNodeRef.current = null;
      } catch (error) {
        console.error('Error stopping sound:', error);
      }
    }
    setIsPlaying(false);
  }, []);
  
  // Get current accuracy percentage
  const accuracyPercentage = useMemo(() => {
    // Calculate accuracy if not available in trend data
    const accuracy = calculateReconstructionAccuracy(waveData, reconstructedWave);
    return accuracy.accuracyPercent.toFixed(2);
  }, [waveData, reconstructedWave]);

  // Prepare wave visualization data for Plotly
  const waveVisualizationData = useMemo((): Data[] => {
    // Сначала добавляем оригинальную волну
    const data: Data[] = [
      {
        x: combinedWaveData.map(point => point.t * 1000),
        y: combinedWaveData.map(point => point.original),
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: 'Исходный сигнал',
        line: {
          color: SCIENTIFIC_COLORS.primary,
          width: 2,
          shape: 'spline' // Добавляем сглаживание линий
        }
      }
    ];
    
    // Добавляем все реконструкции с разным количеством гармоник
    // Выбираем разные цвета для разных уровней гармоник
    const colors = [
      '#3182CE', // Синий
      '#F6AD55', // Оранжевый
      '#68D391', // Зеленый
      '#4FD1C5', // Бирюзовый
      '#F687B3', // Розовый
      SCIENTIFIC_COLORS.secondary // Зеленый из ваших научных цветов для текущей настройки гармоник
    ];
    
    // Получаем уникальные уровни гармоник
    const harmonicLevels = [1, 3, 5, 10, 20, numHarmonics];
    const uniqueLevels = [...new Set(harmonicLevels)].sort((a, b) => a - b);
    
    // Добавляем линии для каждой реконструкции
    uniqueLevels.forEach((harmCount, index) => {
      const isCurrentSelected = harmCount === numHarmonics;
      
      data.push({
        x: combinedWaveData.map(point => point.t * 1000),
        y: combinedWaveData.map(point => point[`harmonic_${harmCount}`]),
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: `${harmCount} гармоник${harmCount > 4 ? "" : "и"}`,
        line: {
          color: colors[index % colors.length],
          width: isCurrentSelected ? 2 : 1.5,
          dash: isCurrentSelected ? 'solid' : 'dash',
          shape: 'spline' // Добавляем сглаживание для всех линий
        }
      });
    });
    
    return data;
  }, [combinedWaveData, numHarmonics, SCIENTIFIC_COLORS]);

  // Layout for wave visualization
  const waveLayout = useMemo((): Partial<Layout> => {
    return {
      title: {
        text: 'Аппроксимация сигнала с помощью рядов Фурье',
        font: {
          family: 'Arial, sans-serif',
          size: 22,
          color: '#333'
        }
      },
      xaxis: {
        title: {
          text: 'Время (мс)',
          font: {
            family: 'Arial, sans-serif',
            size: 16,
            color: '#333'
          }
        },
        domain: [0, duration * 1000], // ms
        showgrid: true,
        gridcolor: 'rgba(200,200,200,0.4)',
        zeroline: true,
        zerolinecolor: 'rgba(0,0,0,0.3)',
        zerolinewidth: 1
      },
      yaxis: {
        title: {
          text: 'Амплитуда',
          font: {
            family: 'Arial, sans-serif',
            size: 16,
            color: '#333'
          }
        },
        showgrid: true,
        gridcolor: 'rgba(200,200,200,0.4)',
        zeroline: true,
        zerolinecolor: 'rgba(0,0,0,0.3)',
        zerolinewidth: 1,
        range: [-amplitude * 1.1, amplitude * 1.1]
      },
      height: 500,
      autosize: true,
      margin: { l: 70, r: 70, t: 60, b: 70 },
      paper_bgcolor: 'rgba(255,255,255,0.95)',
      plot_bgcolor: 'rgba(240,240,240,0.95)',
      legend: {
        x: 0.01,
        y: 0.99,
        bgcolor: 'rgba(255,255,255,0.7)',
        bordercolor: 'rgba(0,0,0,0.1)',
        borderwidth: 1,
        orientation: 'h' as 'h', // горизонтальная легенда
        font: { size: 10 } // меньший шрифт для компактности
      },
      shapes: [
        // Zero line
        {
          type: 'line' as const,
          x0: 0,
          x1: duration * 1000,
          y0: 0,
          y1: 0,
          line: {
            color: 'rgba(0,0,0,0.5)',
            width: 1,
            dash: 'dot'
          }
        }
      ]
    } as Partial<Layout>;
  }, [duration, amplitude]);

  // Spectral visualization data for Plotly
  const spectralVisualizationData = useMemo((): Data[] => {
    const highlightedHarmonics = getHighlightedHarmonics();
    
    return [
      {
        x: spectralData.filter(d => d.harmonic <= 50).map(d => d.harmonic),
        y: spectralData.filter(d => d.harmonic <= 50).map(d => d.amplitude),
        type: 'bar' as const,
        name: 'Амплитуда',
        marker: {
          color: spectralData.filter(d => d.harmonic <= 50).map(d => 
            highlightedHarmonics.includes(d.harmonic) ? 
              SCIENTIFIC_COLORS.highlight : 
              SCIENTIFIC_COLORS.primary
          ),
          line: {
            color: spectralData.filter(d => d.harmonic <= 50).map(d => 
              highlightedHarmonics.includes(d.harmonic) ? 
                '#FF4500' : 
                SCIENTIFIC_COLORS.primary
            ),
            width: 1
          }
        }
      }
    ];
  }, [spectralData, getHighlightedHarmonics, SCIENTIFIC_COLORS]);

  // Layout for spectral visualization
  const spectralLayout = useMemo((): Partial<Layout> => {
    return {
      title: {
        text: 'Спектральный анализ',
        font: {
          family: 'Arial, sans-serif',
          size: 22,
          color: '#333'
        }
      },
      xaxis: {
        title: {
          text: 'Номер гармоники',
          font: {
            family: 'Arial, sans-serif',
            size: 16,
            color: '#333'
          }
        },
        showgrid: true,
        gridcolor: 'rgba(200,200,200,0.4)',
        zeroline: true,
        zerolinecolor: 'rgba(0,0,0,0.3)',
        zerolinewidth: 1,
        dtick: 1
      },
      yaxis: {
        title: {
          text: 'Амплитуда',
          font: {
            family: 'Arial, sans-serif',
            size: 16,
            color: '#333'
          }
        },
        showgrid: true,
        gridcolor: 'rgba(200,200,200,0.4)',
        zeroline: true,
        zerolinecolor: 'rgba(0,0,0,0.3)',
        zerolinewidth: 1,
        type: useLogScale ? 'log' : 'linear'
      },
      height: 500,
      autosize: true,
      margin: { l: 70, r: 70, t: 60, b: 70 },
      paper_bgcolor: 'rgba(255,255,255,0.95)',
      plot_bgcolor: 'rgba(240,240,240,0.95)',
      bargap: 0.15,
      annotations: getHighlightedHarmonics().map(harmonic => {
        const dataPoint = spectralData.find(d => d.harmonic === harmonic);
        if (!dataPoint) return null;
        
        return {
          x: harmonic,
          y: dataPoint.amplitude,
          text: dataPoint.amplitude.toFixed(2),
          showarrow: false,
          yshift: 10,
          font: {
            family: 'Arial, sans-serif',
            size: 10,
            color: '#333'
          }
        };
      }).filter(Boolean)
    } as Partial<Layout>;
  }, [useLogScale, getHighlightedHarmonics, spectralData]);

  // Plotly config
  const plotlyConfig = useMemo((): Partial<Config> => ({
    responsive: true,
    displayModeBar: true,
    modeBarButtonsToRemove: [
      'sendDataToCloud' as const, 
      'toggleSpikelines' as const, 
      'hoverCompareCartesian' as const
    ],
    displaylogo: false,
    toImageButtonOptions: {
      format: 'svg' as const, 
      filename: 'wave_analysis',
      scale: 2
    }
  }), []);
  
  return (
    <div className="p-4 md:p-6 lg:p-8 bg-gray-50 rounded-lg shadow-md">
      <h1 className="text-2xl font-bold mb-6 text-center">Анализатор звуковых волн на основе рядов Фурье</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Control Panel */}
        <div className="bg-[var(--card-bg)] p-4 rounded-lg shadow border ]"> {/* border-[var(--card-border)*/}
          <h2 className="text-xl font-semibold mb-4">Параметры сигнала</h2>
          
          {error && (
            <div className="bg-red-100 text-red-700 p-3 rounded mb-4 border border-red-300">
              {error}
            </div>
          )}
          
          <div className="mb-4">
            <label className="block mb-2">Тип волны:</label>
            <select 
              className="w-full p-2 border rounded"
              value={waveType}
              onChange={(e) => setWaveType(e.target.value)}
            >
              <option value={WAVE_TYPES.SINE}>{WAVE_TYPES.SINE}</option>
              <option value={WAVE_TYPES.SQUARE}>{WAVE_TYPES.SQUARE}</option>
              <option value={WAVE_TYPES.SAWTOOTH}>{WAVE_TYPES.SAWTOOTH}</option>
              <option value={WAVE_TYPES.TRIANGLE}>{WAVE_TYPES.TRIANGLE}</option>
            </select>
            <p className="mt-1 text-sm text-gray-600">{waveExplanation}</p>
          </div>
          
          <div className="mb-4">
            <label className="block mb-2">Частота (Гц): {frequency} Гц</label>
            <div className="flex items-center">
              <span className="mr-2 text-sm w-10">20</span>
              <input 
                type="range" 
                min="20" 
                max="2000" 
                step="1"
                value={frequency}
                onChange={handleFrequencyChange}
                className="w-full"
              />
              <span className="ml-2 text-sm w-12">2000</span>
            </div>
          </div>
          
          <div className="mb-4">
            <label className="block mb-2">Амплитуда: {amplitude}</label>
            <div className="flex items-center">
              <span className="mr-2 text-sm w-10">1000</span>
              <input 
                type="range" 
                min="1000" 
                max="30000" 
                step="1000"
                value={amplitude}
                onChange={handleAmplitudeChange}
                className="w-full"
              />
              <span className="ml-2 text-sm w-12">30000</span>
            </div>
          </div>
          
          <div className="mb-4">
            <label className="block mb-2">Громкость: {Math.round(volume * 100)}%</label>
            <div className="flex items-center">
              <span className="mr-2 text-sm w-10">0%</span>
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.01"
                value={volume}
                onChange={handleVolumeChange}
                className="w-full"
              />
              <span className="ml-2 text-sm w-12">100%</span>
            </div>
          </div>
          
          <div className="mb-4">
            <label className="block mb-2">Длительность (с): {duration.toFixed(2)} с</label>
            <div className="flex items-center">
              <span className="mr-2 text-sm w-10">0.01</span>
              <input 
                type="range" 
                min="0.01" 
                max="2.0" 
                step="0.01"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full"
              />
              <span className="ml-2 text-sm w-12">2.00</span>
            </div>
          </div>
          
          <div className="mb-4">
            <label className="block mb-2">Число гармоник: {numHarmonics}</label>
            <div className="flex items-center">
              <span className="mr-2 text-sm w-6">1</span>
              <input 
                type="range" 
                min="1" 
                max="50" 
                step="1"
                value={numHarmonics}
                onChange={handleHarmonicsChange}
                className="w-full"
              />
              <span className="ml-2 text-sm w-6">50</span>
            </div>
            <div className="mt-1 text-xs text-gray-600 flex justify-between">
              <span>Меньше гармоник (чище звук)</span>
              <span>Больше гармоник (точнее форма)</span>
            </div>
          </div>
          
          <div className="mb-4">
            <label className="block mb-2">Отображаемые гармоники:</label>
            <div className="flex flex-wrap gap-2">
              {multiHarmonicReconstructions.map((recon) => (
                <span 
                  key={recon.harmonics}
                  className={`px-3 py-1 rounded-full text-sm cursor-pointer ${
                    recon.harmonics === numHarmonics 
                      ? 'bg-[var(--primary)] text-white' 
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                  onClick={() => setNumHarmonics(recon.harmonics)}
                >
                  {recon.harmonics}
                </span>
              ))}
            </div>
          </div>
          
          <div className="mb-4">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input 
                type="checkbox" 
                checked={useLogScale} 
                onChange={() => setUseLogScale(!useLogScale)}
                className="form-checkbox h-4 w-4 text-blue-600"
              />
              <span>Логарифмическая шкала для спектра</span>
            </label>
            <p className="mt-1 text-xs text-gray-500">Позволяет лучше видеть гармоники с малой амплитудой</p>
          </div>
          
          <div className="grid grid-cols-2 gap-4 mt-6">
            <div className="bg-blue-50 p-3 rounded border border-blue-200">
              <h3 className="text-sm font-semibold text-blue-800 mb-1">Точность реконструкции</h3>
              <div className="text-2xl font-bold text-blue-600">{accuracyPercentage}%</div>
              <p className="text-xs text-blue-500 mt-1">С текущим числом гармоник</p>
            </div>
            
            <div className="bg-gray-50 p-3 rounded border border-gray-200">
              <h3 className="text-sm font-semibold text-gray-800 mb-1">Частотное разрешение</h3>
              <div className="text-2xl font-bold text-gray-600">{(frequency / 10).toFixed(2)} Гц</div>
              <p className="text-xs text-gray-500 mt-1">При {duration.toFixed(3)} с анализа</p>
            </div>
          </div>
          
          <div className="flex space-x-2 mt-6">
            <button 
              className="bg-[var(--primary)] hover:bg-[var(--primary-light)] text-white py-2 px-4 rounded transition-colors disabled:bg-gray-400"
              onClick={() => playSound(true)}
              disabled={isPlaying}
            >
              Проиграть оригинал
            </button>
            <button 
              className="bg-[var(--secondary)] hover:opacity-90 text-white py-2 px-4 rounded transition-colors disabled:bg-gray-400"
              onClick={() => playSound(false)}
              disabled={isPlaying}
            >
              Проиграть реконструкцию
            </button>
            <button 
              className="bg-[var(--error)] hover:opacity-90 text-white py-2 px-4 rounded transition-colors disabled:bg-gray-400"
              onClick={stopSound}
              disabled={!isPlaying}
            >
              Стоп
            </button>
          </div>
        </div>
        
        {/* Spectral Analysis - Scientific Enhanced Version */}
        <div className="bg-[var(--card-bg)] p-4 rounded-lg shadow border">
          {spectralData.length > 0 ? (
            <Plot
              data={spectralVisualizationData}
              layout={spectralLayout}
              config={plotlyConfig}
              style={{ width: '100%', height: '450px' }}
              useResizeHandler={true}
            />
          ) : (
            <div className="h-96 flex items-center justify-center">
              <p className="text-gray-500">Генерируем данные...</p>
            </div>
          )}
          
          <div className="mt-4 grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-md border border-gray-200">
            <div>
              <p className="font-medium text-gray-700">Постоянная составляющая (DC):</p>
              <p className="text-lg font-semibold text-[var(--primary)]">{fourierCoefficients.a0.toFixed(2)}</p>
              <p className="text-xs text-gray-500">Среднее значение сигнала</p>
            </div>
            <div>
              <p className="font-medium text-gray-700">Доминирующие гармоники:</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {getHighlightedHarmonics().map(harmonic => (
                  <span 
                    key={harmonic}
                    className="inline-block px-2 py-1 text-xs font-medium rounded" 
                    style={{
                      backgroundColor: SCIENTIFIC_COLORS.highlight,
                      color: 'white'
                    }}
                  >
                    {harmonic}
                  </span>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">Характерны для выбранного типа волны</p>
            </div>
          </div>
        </div>
        
        {/* Combined Wave Visualization - Scientific Enhanced Version */}
        <div className="bg-[var(--card-bg)] p-4 rounded-lg shadow border lg:col-span-2">
          {combinedWaveData.length > 0 ? (
            <Plot
              data={waveVisualizationData}
              layout={waveLayout}
              config={plotlyConfig}
              style={{ width: '100%', height: '500px' }}
              useResizeHandler={true}
            />
          ) : (
            <div className="h-96 flex items-center justify-center">
              <p className="text-gray-500">Генерируем данные...</p>
            </div>
          )}
          
          <div className="bg-[var(--card-bg)] p-4 rounded-lg shadow border mt-4">
            <h3 className="text-lg font-semibold mb-3">Сравнение аппроксимаций</h3>
            <p className="text-sm text-gray-600 mb-4">
              Этот график показывает как увеличение количества гармоник улучшает 
              качество аппроксимации исходного сигнала.
            </p>
            
            <div className="mb-4 bg-gray-50 p-3 rounded border border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  {multiHarmonicReconstructions.map((recon, index) => (
                    <div key={recon.harmonics} className="flex items-center">
                      <span 
                        className="inline-block w-4 h-1 mr-1" 
                        style={{
                          backgroundColor: index === multiHarmonicReconstructions.length - 1 
                            ? SCIENTIFIC_COLORS.secondary 
                            : ['#3182CE', '#F6AD55', '#68D391', '#4FD1C5', '#F687B3'][index % 5]
                        }}
                      ></span>
                      <span className="text-xs">{recon.harmonics}</span>
                    </div>
                  ))}
                </div>
                <div className="text-xs text-gray-500">
                  {waveType === 'Синусоида' 
                    ? 'Синусоида - идеальная с 1 гармоникой'
                    : `${
                        waveType === 'Прямоугольная' 
                          ? 'Нечетные гармоники (1/n)' 
                          : waveType === 'Пилообразная'
                            ? 'Все гармоники (1/n)'
                            : 'Нечетные гармоники (1/n²)'
                      }`
                  }
                </div>
              </div>
            </div>
          </div>
          
          <div className="mt-4 text-sm text-gray-600 bg-gray-50 p-4 rounded-lg border border-gray-300">
            <h3 className="font-medium text-gray-800 mb-2">Интерпретация гармонического анализа:</h3>
            <p className="mb-2">
              График демонстрирует процесс аппроксимации исходного сигнала (синяя линия) 
              с помощью ряда Фурье, состоящего из {numHarmonics} гармоник (зеленая линия).
            </p>
            <p>
              {waveType === WAVE_TYPES.SINE ? (
                <>Синусоидальная волна идеально представляется одной гармоникой, поэтому аппроксимация практически совпадает с оригиналом.</>
              ) : waveType === WAVE_TYPES.SQUARE ? (
                <>Прямоугольная волна требует бесконечного ряда нечетных гармоник для идеального воспроизведения. Вы можете заметить эффект Гиббса — колебания около точек разрыва.</>
              ) : waveType === WAVE_TYPES.SAWTOOTH ? (
                <>Пилообразная волна содержит все гармоники, убывающие как 1/n. При малом числе гармоник заметны плавные переходы вместо резких скачков.</>
              ) : (
                <>Треугольная волна содержит только нечетные гармоники, убывающие как 1/n². Благодаря быстрому убыванию амплитуд, аппроксимация сходится быстрее, чем для других типов волн.</>
              )}
            </p>
          </div>
        </div>
        
        {/* Technical Information Panel */}
        <div className="bg-[var(--card-bg)] p-4 rounded-lg shadow border lg:col-span-2">
          <h2 className="text-xl font-semibold mb-4">Техническая информация</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <h3 className="text-base font-medium text-gray-800 mb-2">Параметры анализа</h3>
              <table className="w-full text-sm">
                <tbody>
                  <tr>
                    <td className="py-1 text-gray-600">Частота дискретизации:</td>
                    <td className="py-1 text-right font-medium">{SAMPLE_RATE} Гц</td>
                  </tr>
                  <tr>
                    <td className="py-1 text-gray-600">Длительность анализа:</td>
                    <td className="py-1 text-right font-medium">{duration.toFixed(3)} с</td>
                  </tr>
                  <tr>
                    <td className="py-1 text-gray-600">Количество отсчетов:</td>
                    <td className="py-1 text-right font-medium">{Math.floor(SAMPLE_RATE * duration)}</td>
                  </tr>
                  <tr>
                    <td className="py-1 text-gray-600">Частотное разрешение:</td>
                    <td className="py-1 text-right font-medium">{(1/duration).toFixed(2)} Гц</td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <h3 className="text-base font-medium text-gray-800 mb-2">Характеристики сигнала</h3>
              <table className="w-full text-sm">
                <tbody>
                  <tr>
                    <td className="py-1 text-gray-600">Основная частота:</td>
                    <td className="py-1 text-right font-medium">{frequency} Гц</td>
                  </tr>
                  <tr>
                    <td className="py-1 text-gray-600">Амплитуда:</td>
                    <td className="py-1 text-right font-medium">{amplitude}</td>
                  </tr>
                  <tr>
                    <td className="py-1 text-gray-600">Период колебаний:</td>
                    <td className="py-1 text-right font-medium">{(1/frequency * 1000).toFixed(2)} мс</td>
                  </tr>
                  <tr>
                    <td className="py-1 text-gray-600">Полное количество периодов:</td>
                    <td className="py-1 text-right font-medium">{(frequency * duration).toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <h3 className="text-base font-medium text-gray-800 mb-2">Свойства спектра</h3>
              <table className="w-full text-sm">
                <tbody>
                  <tr>
                    <td className="py-1 text-gray-600">Количество гармоник:</td>
                    <td className="py-1 text-right font-medium">{numHarmonics}</td>
                  </tr>
                  <tr>
                    <td className="py-1 text-gray-600">Высшая гармоника:</td>
                    <td className="py-1 text-right font-medium">{frequency * numHarmonics} Гц</td>
                  </tr>
                  <tr>
                    <td className="py-1 text-gray-600">Точность реконструкции:</td>
                    <td className="py-1 text-right font-medium">{accuracyPercentage}%</td>
                  </tr>
                  <tr>
                    <td className="py-1 text-gray-600">Значимых гармоник:</td>
                    <td className="py-1 text-right font-medium">{spectralData.filter(d => d.amplitude > 0.01 * Math.max(...spectralData.map(d => d.amplitude))).length}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          
          <div className="mt-6 bg-blue-50 p-4 rounded-lg border border-blue-200">
            <h3 className="text-base font-medium text-blue-800 mb-2">Подробнее о гармоническом анализе</h3>
            <p className="text-sm text-blue-700 mb-2">
              Разложение сигнала в ряд Фурье представляет его как сумму синусоид разных частот и амплитуд.
              Этот подход лежит в основе многих методов обработки сигналов и сжатия данных (MP3, JPEG).
            </p>
            <p className="text-sm text-blue-700">
              Для периодического сигнала с частотой f, ряд Фурье содержит гармоники с частотами f, 2f, 3f...
              Амплитуды этих гармоник определяют спектр сигнала и его тембровую окраску.
            </p>
            
            <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-2 text-sm">
              <div className="bg-white p-2 rounded border border-blue-100">
                <p className="font-medium text-blue-800">Синусоида</p>
                <p className="text-blue-600">Содержит только 1 гармонику</p>
              </div>
              <div className="bg-white p-2 rounded border border-blue-100">
                <p className="font-medium text-blue-800">Прямоугольная</p>
                <p className="text-blue-600">Только нечетные гармоники (1/n)</p>
              </div>
              <div className="bg-white p-2 rounded border border-blue-100">
                <p className="font-medium text-blue-800">Пилообразная</p>
                <p className="text-blue-600">Все гармоники (1/n)</p>
              </div>
              <div className="bg-white p-2 rounded border border-blue-100">
                <p className="font-medium text-blue-800">Треугольная</p>
                <p className="text-blue-600">Только нечетные гармоники (1/n²)</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


export default WaveAnalyzer;