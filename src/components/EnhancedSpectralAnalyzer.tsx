"use client"

import React, { useState, useEffect, useMemo } from 'react';
import Plot from 'react-plotly.js';
import FFT from 'fft.js';
import { SpectralPoint } from '@/utils/fourierTransform';
import { NOTE_FREQUENCIES, NOTE_NAMES_RU } from '@/constants/noteFrequencies';

interface EnhancedSpectralAnalyzerProps {
  data: SpectralPoint[];
  selectedNotes: string[];
  rawAudioData?: Float32Array;  // Optional raw audio data for custom FFT processing
  sampleRate?: number;          // Audio sample rate (default: 44100)
  height?: number;
  width?: number;
}

/**
 * Enhanced Spectral Analyzer Component
 * 
 * Features:
 * - High-quality visualization using Plotly.js
 * - Optional custom FFT processing with fft.js
 * - Floating card design for peak display
 * - Dynamic frequency range adjustment
 * - Interactive tooltips and zooming
 */
const EnhancedSpectralAnalyzer: React.FC<EnhancedSpectralAnalyzerProps> = ({
  data,
  selectedNotes,
  rawAudioData,
  sampleRate = 44100,
  height = 400,
  width = 800
}) => {
  // State for processed data
  const [processedData, setProcessedData] = useState<SpectralPoint[]>([]);
  
  // Process data with fft.js if raw audio data is provided
  useEffect(() => {
    if (rawAudioData && rawAudioData.length > 0) {
      // Find power of 2 that fits the data
      const fftSize = Math.pow(2, Math.ceil(Math.log2(rawAudioData.length)));
      
      // Initialize FFT processor
      const fft = new FFT(fftSize);
      
      // Prepare input/output buffers
      const input = new Float32Array(fftSize);
      const output = new Float32Array(fftSize);
      
      // Copy raw audio data to input buffer
      for (let i = 0; i < rawAudioData.length; i++) {
        input[i] = rawAudioData[i];
      }
      
      // Apply window function (Hann window) to reduce spectral leakage
      for (let i = 0; i < rawAudioData.length; i++) {
        input[i] *= 0.5 * (1 - Math.cos(2 * Math.PI * i / (rawAudioData.length - 1)));
      }
      
      // Perform FFT
      fft.realTransform(output, input);
      fft.completeSpectrum(output);
      
      // Process FFT output to get magnitude spectrum
      const customSpectralData: SpectralPoint[] = [];
      const nyquist = sampleRate / 2;
      const binSize = nyquist / (fftSize / 2);
      
      for (let i = 0; i < fftSize / 2; i++) {
        const re = output[2 * i];
        const im = output[2 * i + 1];
        const magnitude = Math.sqrt(re * re + im * im) / (fftSize / 2);
        const frequency = i * binSize;
        
        // Only include frequencies up to 5kHz or so
        if (frequency <= 5000) {
          customSpectralData.push({
            harmonic: i,
            frequency,
            amplitude: magnitude
          });
        }
      }
      
      setProcessedData(customSpectralData);
    } else {
      // Use the provided spectral data
      setProcessedData(data);
    }
  }, [data, rawAudioData, sampleRate]);
  
  // Extract spectral peaks and optimize display range
  const { peaks, maxFrequency } = useMemo(() => {
    if (processedData.length === 0) {
      return { peaks: [], maxFrequency: 2000 };
    }
    
    // Find the maximum amplitude for threshold calculation
    const maxAmplitude = Math.max(...processedData.map(d => d.amplitude));
    const threshold = maxAmplitude * 0.1;
    
    // Find peaks
    const foundPeaks = [];
    for (let i = 5; i < processedData.length - 5; i++) {
      const current = processedData[i].amplitude;
      let isPeak = current > threshold;
      
      // Check surrounding points to confirm this is a local maximum
      for (let j = i - 5; j <= i + 5; j++) {
        if (j !== i && j >= 0 && j < processedData.length) {
          if (processedData[j].amplitude >= current) {
            isPeak = false;
            break;
          }
        }
      }
      
      if (isPeak) {
        const freq = processedData[i].frequency || 0;
        
        // Find closest musical note
        const closestNote = Object.entries(NOTE_FREQUENCIES).reduce(
          (closest, [note, noteFreq]) => {
            const diff = Math.abs(freq - noteFreq);
            return diff < closest.diff ? { note, diff, freq: noteFreq } : closest;
          },
          { note: '', diff: Infinity, freq: 0 }
        );
        
        // Get Russian note name
        const noteName = closestNote.note.replace(/\d/g, '');
        const octave = closestNote.note.match(/\d+/)?.[0] || '';
        const nameRu = NOTE_NAMES_RU[noteName];
        
        // Calculate cents deviation
        const cents = 1200 * Math.log2(freq / closestNote.freq);
        
        foundPeaks.push({
          frequency: freq,
          amplitude: current,
          note: closestNote.note,
          nameRu: `${nameRu}${octave}`,
          cents: Math.round(cents),
          index: i
        });
      }
    }
    
    // Sort peaks by amplitude and limit to top 5
    const sortedPeaks = foundPeaks
      .sort((a, b) => b.amplitude - a.amplitude)
      .slice(0, 5);
    
    // Calculate appropriate maximum frequency for display
    // Find the highest significant peak and add buffer
    const significantPeaks = sortedPeaks.filter(p => p.amplitude > threshold * 5);
    let highestFreq = Math.max(
      ...significantPeaks.map(p => p.frequency),
      ...selectedNotes.map(note => NOTE_FREQUENCIES[note]),
      600 // Minimum default
    );
    
    // Add 20% buffer and round to nearest 500Hz
    const buffer = highestFreq * 0.2;
    const calculatedMaxFreq = Math.min(Math.ceil((highestFreq + buffer) / 500) * 500, 5000);
    
    return {
      peaks: sortedPeaks,
      maxFrequency: calculatedMaxFreq
    };
  }, [processedData, selectedNotes]);
  
  // Prepare data for Plotly
  const plotData = useMemo(() => {
    // Create spectral data trace
    const spectralTrace = {
      x: processedData.map(d => d.frequency),
      y: processedData.map(d => d.amplitude),
      type: 'scatter',
      mode: 'lines',
      name: 'Спектр',
      line: {
        shape: 'spline',
        color: 'rgba(10,132,255,0.8)',
        width: 2
      },
      fill: 'tozeroy',
      fillcolor: 'rgba(10,132,255,0.2)',
      hoverinfo: 'x+y',
      hovertemplate: 'Частота: %{x:.2f} Гц<br>Амплитуда: %{y:.6f}<extra></extra>'
    };
    
    // Create traces for selected notes
    const noteTraces = selectedNotes.map(note => {
      const frequency = NOTE_FREQUENCIES[note];
      const noteName = `${note} (${NOTE_NAMES_RU[note.replace(/\d/g, '')]})`;
      
      return {
        x: [frequency, frequency],
        y: [0, 0.0001], // Small vertical line
        type: 'scatter',
        mode: 'lines',
        name: noteName,
        line: {
          color: 'rgba(10,132,255,0.4)',
          width: 1,
          dash: 'dash'
        },
        hoverinfo: 'name+x',
        hovertemplate: `${noteName}: %{x:.1f} Гц<extra></extra>`
      };
    });
    
    // Create traces for detected peaks
    const peakTraces = peaks.map(peak => {
      // Colors for peaks
      const peakColors = [
        '#FF453A', '#FF9F0A', '#30D158', '#64D2FF', '#BF5AF2'
      ];
      const index = peaks.indexOf(peak);
      const color = peakColors[index % peakColors.length];
      
      // Create annotation for the peak
      const centsText = peak.cents !== 0 
        ? ` (${peak.cents > 0 ? '+' : ''}${peak.cents} центов)` 
        : '';
      
      return {
        x: [peak.frequency, peak.frequency],
        y: [0, peak.amplitude],
        type: 'scatter',
        mode: 'lines',
        name: `${peak.note} (${peak.nameRu})`,
        line: {
          color: color,
          width: 2
        },
        hoverinfo: 'name+x+y',
        hovertemplate: `
          ${peak.note} (${peak.nameRu})${centsText}<br>
          Частота: %{x:.1f} Гц<br>
          Амплитуда: %{y:.6f}
          <extra></extra>
        `
      };
    });
    
    return [spectralTrace, ...noteTraces, ...peakTraces];
  }, [processedData, selectedNotes, peaks]);
  
  // Layout configuration for plotly
  const layout = useMemo(() => {
    return {
      title: '',
      height: height,
      width: width,
      margin: { l: 50, r: 30, t: 10, b: 50 },
      xaxis: {
        title: 'Частота',
        titlefont: { size: 12, color: '#666' },
        showgrid: true,
        zeroline: false,
        range: [0, maxFrequency],
        ticksuffix: 'Hz',
        hoverformat: '.2f'
      },
      yaxis: {
        title: 'Амплитуда',
        titlefont: { size: 12, color: '#666' },
        showgrid: true,
        zeroline: true,
        zerolinewidth: 1,
        zerolinecolor: '#eee',
        hoverformat: '.6f',
        fixedrange: true
      },
      plot_bgcolor: 'rgba(250,250,250,0.8)',
      paper_bgcolor: 'rgba(0,0,0,0)',
      font: { family: 'SF Pro Display, -apple-system, BlinkMacSystemFont, sans-serif' },
      showlegend: false,
      hovermode: 'closest',
      dragmode: 'zoom',
      modebar: {
        orientation: 'h',
        bgcolor: 'rgba(255,255,255,0.8)',
        color: '#666',
        activecolor: '#0A84FF'
      }
    };
  }, [height, width, maxFrequency]);
  
  // Config options for plotly
  const config = {
    responsive: true,
    displayModeBar: true,
    modeBarButtonsToRemove: [
      'pan2d', 'select2d', 'lasso2d', 'resetScale2d', 
      'toggleSpikelines', 'hoverClosestCartesian',
      'hoverCompareCartesian'
    ],
    displaylogo: false,
    toImageButtonOptions: {
      format: 'png',
      filename: 'spectral_analysis',
      height: height,
      width: width,
      scale: 2
    }
  };
  
  // Peak card colors
  const peakColors = [
    { bg: '#FF453A', text: '#fff' },  // Red
    { bg: '#FF9F0A', text: '#fff' },  // Orange
    { bg: '#30D158', text: '#fff' },  // Green
    { bg: '#64D2FF', text: '#000' },  // Light Blue
    { bg: '#BF5AF2', text: '#fff' }   // Purple
  ];

  return (
    <div className="w-full font-sans">
      <h2 className="text-xl font-semibold mb-4">Спектральный анализ</h2>
      
      {/* Floating peak cards */}
      {peaks.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {peaks.map((peak, index) => (
            <div 
              key={`peak-card-${index}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 12px',
                borderRadius: '8px',
                backgroundColor: peakColors[index % peakColors.length].bg,
                color: peakColors[index % peakColors.length].text,
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{peak.note} ({peak.nameRu})</div>
                <div style={{ fontSize: '12px', opacity: 0.9 }}>
                  {peak.frequency.toFixed(1)}Гц
                  {peak.cents !== 0 && (
                    <span style={{ marginLeft: '4px' }}>
                      ({peak.cents > 0 ? '+' : ''}{peak.cents} центов)
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Plotly chart */}
      <div style={{ 
        borderRadius: '10px',
        overflow: 'hidden',
        backgroundColor: '#f8f9fa',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        {processedData.length > 0 ? (
          <Plot
            data={plotData}
            layout={layout}
            config={config}
            style={{ width: '100%', height: '100%' }}
          />
        ) : (
          <div className="flex items-center justify-center" style={{ height: height + 'px' }}>
            <div className="text-center">
              <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
              <p className="mt-2 text-sm text-gray-500">Нет данных для анализа</p>
              <p className="mt-1 text-xs text-gray-400">Выберите ноты и нажмите "Проиграть аккорд"</p>
            </div>
          </div>
        )}
      </div>
      
      {/* Selected notes */}
      {selectedNotes.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Выбранные ноты:</h3>
          <div className="flex flex-wrap gap-2">
            {selectedNotes.map(note => (
              <span 
                key={note} 
                className="px-4 py-1.5 rounded-md text-sm font-medium"
                style={{ 
                  backgroundColor: 'rgba(10,132,255,0.1)', 
                  color: '#0A84FF'
                }}
              >
                {note} ({NOTE_NAMES_RU[note.replace(/\d/g, '')]}) {NOTE_FREQUENCIES[note].toFixed(1)} Гц
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedSpectralAnalyzer;