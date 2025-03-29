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
import { WAVE_TYPES, SAMPLE_RATE, MAX_AMPLITUDE, DEFAULT_DURATION } from '@/constants/audioConstants';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer, ReferenceLine, BarChart, Bar, Cell 
} from 'recharts';
import Plot from 'react-plotly.js';

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
  
  // Refs for Web Audio API objects
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

  // Scientific color scheme for harmonics
  const SCIENTIFIC_COLORS = {
    primary: '#4169E1',      // Royal Blue
    secondary: '#228B22',    // Forest Green
    highlight: '#FF7F00',    // Orange
    accent: '#9932CC',       // Dark Orchid
    contrast: '#CD5C5C',     // Indian Red
    neutral: '#555555',      // Dark Gray
  };
  
  // Combined data for dynamic visualization with precise time alignment
  const combinedWaveData = useMemo(() => {
    // Create a combined dataset with original and reconstructed waves
    if (!waveData.length || !reconstructedWave.length) return [];
    
    // Create a unified time grid to ensure perfect alignment
    const startTime = 0;
    const endTime = duration;
    const maxPoints = 1000; // Higher resolution for smoother curves
    const timeStep = (endTime - startTime) / maxPoints;
    
    const result = [];
    
    // Use interpolation to sample both waves at exactly the same time points
    for (let i = 0; i <= maxPoints; i++) {
      const t = startTime + i * timeStep;
      
      // Find nearest points in original data
      const origIndex = waveData.findIndex(p => p.t >= t);
      let originalValue = null;
      
      if (origIndex > 0) {
        // Linear interpolation between points for smoother rendering
        const p1 = waveData[origIndex - 1];
        const p2 = waveData[origIndex];
        const factor = (t - p1.t) / (p2.t - p1.t);
        originalValue = p1.value + factor * (p2.value - p1.value);
      } else if (origIndex === 0) {
        originalValue = waveData[0].value;
      } else if (origIndex === -1 && waveData.length > 0) {
        originalValue = waveData[waveData.length - 1].value;
      }
      
      // Find nearest points in reconstructed data
      const reconIndex = reconstructedWave.findIndex(p => p.t >= t);
      let reconstructedValue = null;
      
      if (reconIndex > 0) {
        // Linear interpolation between points
        const p1 = reconstructedWave[reconIndex - 1];
        const p2 = reconstructedWave[reconIndex];
        const factor = (t - p1.t) / (p2.t - p1.t);
        reconstructedValue = p1.value + factor * (p2.value - p1.value);
      } else if (reconIndex === 0) {
        reconstructedValue = reconstructedWave[0].value;
      } else if (reconIndex === -1 && reconstructedWave.length > 0) {
        reconstructedValue = reconstructedWave[reconstructedWave.length - 1].value;
      }
      
      result.push({
        t,
        original: originalValue,
        reconstructed: reconstructedValue
      });
    }
    
    return result;
  }, [waveData, reconstructedWave, duration]);
  
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
  
  // Generate the wave and its Fourier analysis
  const generateWave = useCallback(() => {
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
    
    setWaveData(data);
    
    // Calculate Fourier coefficients
    const coefficients = calculateFourierCoefficients(data, 50);
    setFourierCoefficients(coefficients);
    
    // Reconstruct wave with current harmonic count
    updateReconstructedWave(coefficients, numHarmonics);
    
    // Prepare spectral data
    const spectral = prepareSpectralData(coefficients, frequency);
    setSpectralData(spectral);
    
  }, [waveType, frequency, amplitude, duration, numHarmonics]);
  
  // Update reconstructed wave when harmonic count changes
  const updateReconstructedWave = useCallback((
    coefficients: FourierCoefficients, 
    harmonicCount: number
  ) => {
    const cacheKey = createReconstructionCacheKey(
      coefficients, 
      duration, 
      frequency, 
      harmonicCount
    );
    
    let reconstructed: WavePoint[];
    
    if (reconstructionCache.has(cacheKey)) {
      reconstructed = reconstructionCache.get(cacheKey)!;
    } else {
      reconstructed = reconstructWaveFromFourier(
        coefficients, 
        duration, 
        frequency, 
        harmonicCount
      );
      reconstructionCache.set(cacheKey, reconstructed);
    }
    
    setReconstructedWave(reconstructed);
  }, [duration, frequency]);
  
  // Handle harmonic slider change
  const handleHarmonicsChange = useCallback((newValue: number) => {
    setNumHarmonics(newValue);
    updateReconstructedWave(fourierCoefficients, newValue);
  }, [fourierCoefficients, updateReconstructedWave]);
  
  // Effect to generate wave when parameters change
  useEffect(() => {
    generateWave();
  }, [generateWave]);
  
  // Effect to clean up resources on unmount
  useEffect(() => {
    return () => {
      if (sourceNodeRef.current) {
        sourceNodeRef.current.stop();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(err => {
          console.error('Error closing AudioContext:', err);
        });
      }
      reconstructionCache.clear();
    };
  }, []);
  
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
        
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
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
      });
      
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
  }, [waveType, frequency, amplitude, fourierCoefficients, numHarmonics]);
  
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
  const waveVisualizationData = useMemo(() => {
    return [
      {
        x: combinedWaveData.map(point => point.t * 1000), // Convert to ms for better visualization
        y: combinedWaveData.map(point => point.original),
        type: 'scatter',
        mode: 'lines',
        name: 'Исходный сигнал',
        line: {
          color: SCIENTIFIC_COLORS.primary,
          width: 2
        }
      },
      {
        x: combinedWaveData.map(point => point.t * 1000), // Convert to ms for better visualization
        y: combinedWaveData.map(point => point.reconstructed),
        type: 'scatter',
        mode: 'lines',
        name: `Реконструкция (${numHarmonics} гармоник)`,
        line: {
          color: SCIENTIFIC_COLORS.secondary,
          width: 2,
          dash: 'solid'
        }
      }
    ];
  }, [combinedWaveData, numHarmonics, SCIENTIFIC_COLORS]);

  // Wave visualization layout for Plotly
  const waveLayout = useMemo(() => {
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
        borderwidth: 1
      },
      shapes: [
        // Zero line
        {
          type: 'line',
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
    };
  }, [duration, amplitude, numHarmonics]);

  // Spectral visualization data for Plotly
  const spectralVisualizationData = useMemo(() => {
    // Highlight important harmonics
    const highlightedHarmonics = getHighlightedHarmonics();
    
    return [
      {
        x: spectralData.filter(d => d.harmonic <= 50).map(d => d.harmonic),
        y: spectralData.filter(d => d.harmonic <= 50).map(d => d.amplitude),
        type: 'bar',
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

  // Spectral visualization layout for Plotly
  const spectralLayout = useMemo(() => {
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
      height: 450,
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
    };
  }, [useLogScale, getHighlightedHarmonics, spectralData]);

  // Enhanced config for Plotly
  const plotlyConfig = {
    responsive: true,
    displayModeBar: true,
    modeBarButtonsToRemove: [
      'sendDataToCloud', 'toggleSpikelines', 'hoverCompareCartesian',
      'drawline', 'drawopenpath', 'drawcircle', 'drawrect', 'eraseshape'
    ],
    displaylogo: false,
    toImageButtonOptions: {
      format: 'svg', // Better for scientific publications
      filename: 'wave_analysis',
      scale: 2
    }
  };
  
  return (
    <div className="p-4 bg-[var(--background)] min-h-screen">
      <h1 className="text-2xl font-bold mb-6 text-center">Анализатор звуковых волн на основе рядов Фурье</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Control Panel */}
        <div className="bg-[var(--card-bg)] p-4 rounded-lg shadow border border-[var(--card-border)]">
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
                onChange={(e) => setFrequency(Number(e.target.value))}
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
                onChange={(e) => setAmplitude(Number(e.target.value))}
                className="w-full"
              />
              <span className="ml-2 text-sm w-12">30000</span>
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
                onChange={(e) => handleHarmonicsChange(Number(e.target.value))}
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
        <div className="bg-[var(--card-bg)] p-4 rounded-lg shadow border border-[var(--card-border)]">
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
        <div className="bg-[var(--card-bg)] p-4 rounded-lg shadow border border-[var(--card-border)] lg:col-span-2">
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
          
          <div className="mt-4 text-sm text-gray-600 bg-gray-50 p-4 rounded-lg border border-gray-200">
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
        <div className="bg-[var(--card-bg)] p-4 rounded-lg shadow border border-[var(--card-border)] lg:col-span-2">
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