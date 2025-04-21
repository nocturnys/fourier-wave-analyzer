import React, { useMemo, useCallback } from 'react';
import { SpectralPoint } from '@/utils/fourierTransform';
import { NOTE_FREQUENCIES, NOTE_NAMES_RU } from '@/constants/noteFrequencies';
import Plot from 'react-plotly.js';
import { Layout, Data, Annotations, Config } from 'plotly.js';

interface MusicSpectralChartProps {
  data: SpectralPoint[];
  selectedNotes: string[];
  height?: number | string;
}

// Fix: Define helper type predicate
function isNotNullOrUndefined<T>(input: null | undefined | T): input is T {
    return input != null;
}



/**
 * Enhanced spectral analysis visualization optimized for complex chords with multiple notes
 * Uses Plotly.js for scientific-quality visualization
 */
const MusicSpectralChart: React.FC<MusicSpectralChartProps> = ({
  data,
  selectedNotes,
  height = 500 // Increased height for better visualization
}) => {
  // Process spectral data with optimized peak detection
  const { processedData, peaks, frequencyRange } = useMemo(() => {
    if (!data || data.length === 0) return { 
      processedData: [], 
      peaks: [],
      frequencyRange: [20, 2000] as [number, number]
    };
    
    // Fix: Ensure rigorous filtering for Datum[] compatibility
    const filteredData = data
      .filter((point): point is SpectralPoint & { frequency: number; amplitude: number } => 
          point.frequency !== undefined && 
          point.amplitude !== undefined &&
          typeof point.frequency === 'number' && // Explicit type check
          typeof point.amplitude === 'number' && // Explicit type check
          !isNaN(point.frequency) && 
          !isNaN(point.amplitude)
      )
      .sort((a, b) => a.frequency - b.frequency);
    
    const processedData = filteredData.map(point => ({
      frequency: point.frequency,
      amplitude: point.amplitude,
      note: Object.entries(NOTE_FREQUENCIES).find(
        ([, freq]) => Math.abs((point.frequency || 0) - freq) < 3
      )?.[0] || undefined
    }));
    
    // Find spectral peaks with enhanced sensitivity for closely-spaced notes
    const peakResults = [];
    const maxAmplitude = Math.max(...processedData.map(d => d.amplitude));
    // Use adaptive threshold based on data characteristics
    const threshold = maxAmplitude * (processedData.length > 1000 ? 0.05 : 0.1);
    
    // Peak detection with width consideration to avoid duplicates
    const minPeakDistance = 5; // Hz
    let lastPeakPos = -100; // Initialize far away
    
    for (let i = 1; i < processedData.length - 1; i++) {
      const prev = processedData[i-1].amplitude;
      const current = processedData[i].amplitude;
      const next = processedData[i+1].amplitude;
      const freq = processedData[i].frequency || 0;
      
      // Check if it's a peak and far enough from previous peak
      if (current > threshold && current > prev && current > next && 
          Math.abs(freq - lastPeakPos) > minPeakDistance) {
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
        
        // Create formatted deviation text
        const centsValue = Math.round(cents);
        const centsText = centsValue === 0 ? '' : 
                         (centsValue > 0 ? `+${centsValue}` : `${centsValue}`);
        
        // Only add if it's a significant peak
        if (current > threshold * 2.5) {
          peakResults.push({
            frequency: freq,
            amplitude: current,
            note: closestNote.note,
            nameRu: `${nameRu}${octave}`,
            cents: centsValue,
            deviation: centsText ? `(${centsText} центов)` : '',
            displayName: `${closestNote.note} (${nameRu}${octave})`,
            frequencyText: `${freq.toFixed(1)}Гц`
          });
          
          lastPeakPos = freq;
        }
      }
    }
    
    // Sort peaks by frequency for logical display
    const sortedPeaks = peakResults
      .sort((a, b) => a.frequency - b.frequency)
      .slice(0, 12); // Handle up to 12 peaks, which should be enough for complex chords
    
    // Calculate appropriate frequency range
    const significantPeaks = sortedPeaks.filter(p => p.amplitude > threshold * 5);
    const highestFreq = Math.max(
      ...significantPeaks.map(p => p.frequency),
      ...selectedNotes.map(note => NOTE_FREQUENCIES[note]),
      600 // Minimum default
    );
    
    const lowestFreq = Math.min(
      ...significantPeaks.map(p => p.frequency),
      ...selectedNotes.map(note => NOTE_FREQUENCIES[note]),
      100 // Default start frequency
    );
    
    // Add buffer to range
    const buffer = (highestFreq - lowestFreq) * 0.15;
    const minFreq = Math.max(20, Math.floor((lowestFreq - buffer) / 10) * 10);
    const maxFreq = Math.min(2000, Math.ceil((highestFreq + buffer) / 100) * 100);
    
    return {
      processedData,
      peaks: sortedPeaks,
      frequencyRange: [minFreq, maxFreq]
    };
  }, [data, selectedNotes]);

  // Fix: Wrap SCIENTIFIC_COLORS in useMemo
  const SCIENTIFIC_COLORS = useMemo(() => ({
    primary: 'rgb(65, 105, 225)',       
    primaryLight: 'rgba(65, 105, 225, 0.2)',
    secondary: 'rgb(46, 139, 87)',      
    highlight: 'rgb(255, 127, 0)',      
    peaks: [
      'rgb(228, 26, 28)',   
      'rgb(55, 126, 184)',  
      'rgb(77, 175, 74)',   
      'rgb(152, 78, 163)',  
      'rgb(255, 127, 0)'    
    ]
  }), []); // Empty dependency array

  // Prepare data for Plotly visualization
  const plotlyData = useMemo((): Data[] => {
    if (processedData.length === 0) return [];

    const mainTrace: Partial<Plotly.ScatterData> = {
      x: processedData.map(d => d.frequency),
      y: processedData.map(d => d.amplitude),
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: 'Спектр',
      line: {
        shape: 'spline',
        color: SCIENTIFIC_COLORS.primary,
        width: 2
      },
      fill: 'tozeroy' as const,
      fillcolor: SCIENTIFIC_COLORS.primaryLight,
      hoverinfo: 'x+y' as const,
      hovertemplate: '<b>Частота</b>: %{x:.1f} Гц<br><b>Амплитуда</b>: %{y:.6f}<extra></extra>'
    };

    // Filter potential nulls during mapping for notes
    const noteTraces: Array<Partial<Plotly.ScatterData>> = selectedNotes
        .map(note => {
            const freq = NOTE_FREQUENCIES[note];
            const noteInfo = NOTE_NAMES_RU[note.replace(/\d/g, '')];
            if (!freq || !noteInfo) return null; // Return null if info missing
            const noteName = `${note} (${noteInfo})`;
            
            return {
                x: [freq, freq],
                y: [0, 0.0001], // Small vertical line
                type: 'scatter' as const,
                mode: 'lines' as const,
                name: noteName,
                line: {
                    color: 'rgba(65, 105, 225, 0.5)',
                    width: 1.5,
                    dash: 'dash' as const
                },
                hoverinfo: 'text' as const,
                hovertemplate: `<b>${noteName}</b>: %{x:.1f} Гц<extra></extra>`
            };
        })
        .filter(isNotNullOrUndefined); // Now filter works

    const peakTraces: Array<Partial<Plotly.ScatterData>> = peaks.map((peak, index) => {
      const color = SCIENTIFIC_COLORS.peaks[index % SCIENTIFIC_COLORS.peaks.length];
      
      return {
        x: [peak.frequency, peak.frequency],
        y: [0, peak.amplitude],
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: `${peak.note} (${peak.nameRu})`,
        line: {
          color: color,
          width: 2
        },
        hoverinfo: 'text' as const,
        hovertemplate: `
          <b>${peak.note} (${peak.nameRu})</b>${peak.cents !== 0 ? ' (' + (peak.cents > 0 ? '+' : '') + peak.cents + ' центов)' : ''}<br>
          <b>Частота</b>: %{x:.1f} Гц<br>
          <b>Амплитуда</b>: %{y:.6f}
          <extra></extra>
        `
      };
    }).filter(isNotNullOrUndefined);

    return [mainTrace, ...noteTraces, ...peakTraces] as Data[];
  }, [processedData, selectedNotes, peaks, SCIENTIFIC_COLORS]);

  // Define helper function outside or useCallback if needed inside component scope
  const is880InRange = useCallback(() => {
    return frequencyRange[1] >= 880;
  }, [frequencyRange]);

  // Layout configuration for Plotly
  const plotlyLayout = useMemo((): Partial<Layout> => {
    return {
      title: {
        text: 'Спектральный анализ музыкальных нот',
        font: {
          family: 'Arial, sans-serif',
          size: 20,
          color: '#333'
        }
      },
      height: typeof height === 'number' ? height : 500,
      autosize: true,
      margin: { l: 70, r: 70, t: 50, b: 70 },
      paper_bgcolor: 'rgba(255,255,255,0.95)',
      plot_bgcolor: 'rgba(248,249,250,0.95)',
      xaxis: {
        title: {
          text: 'Частота (Гц)',
          font: {
            family: 'Arial, sans-serif',
            size: 16,
            color: '#333'
          }
        },
        range: frequencyRange,
        showgrid: true,
        gridcolor: 'rgba(200,200,200,0.4)',
        gridwidth: 1,
        zeroline: false,
        ticksuffix: ' Гц',
        hoverformat: '.1f',
        tickfont: {
          family: 'Arial, sans-serif',
          size: 12,
          color: '#333'
        },
        // Add minor ticks for more precise reading
        minor: {
          showgrid: true,
          gridcolor: 'rgba(200,200,200,0.2)',
          gridwidth: 0.5,
          nticks: 5
        }
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
        gridwidth: 1,
        zeroline: true,
        zerolinewidth: 1,
        zerolinecolor: 'rgba(0,0,0,0.3)',
        hoverformat: '.6f',
        tickfont: {
          family: 'Arial, sans-serif',
          size: 12,
          color: '#333'
        }
      },
      showlegend: false,
      hovermode: 'closest' as const,
      hoverlabel: {
        bgcolor: 'rgba(255,255,255,0.95)',
        font: {
          family: 'Arial, sans-serif',
          size: 12,
          color: '#333'
        },
        bordercolor: 'rgba(0,0,0,0.1)'
      },
      // Add note reference lines at A4 = 440Hz and its octaves
      shapes: [
        {
          type: 'line' as const,
          x0: 440,
          x1: 440,
          y0: 0,
          y1: 1,
          yref: 'paper' as const,
          line: {
            color: 'rgba(200,0,0,0.3)',
            width: 1,
            dash: 'dash' as const
          }
        },
        // Add octave lines if in range
        frequencyRange[1] >= 880 ? {
          type: 'line' as const,
          x0: 880,
          x1: 880,
          y0: 0,
          y1: 1,
          yref: 'paper' as const,
          line: {
            color: 'rgba(200,0,0,0.2)',
            width: 1,
            dash: 'dash' as const
          }
        } : null,
        frequencyRange[0] <= 220 ? {
          type: 'line' as const,
          x0: 220,
          x1: 220,
          y0: 0,
          y1: 1,
          yref: 'paper' as const,
          line: {
            color: 'rgba(200,0,0,0.2)',
            width: 1,
            dash: 'dash' as const
          }
        } : null
      ].filter(isNotNullOrUndefined),
      annotations: [
        // Reference note label for A4 = 440Hz
        {
          x: 440,
          xref: 'x' as const,
          yref: 'paper' as const,
          text: 'A4 (Ля)',
          showarrow: false,
          font: {
            family: 'Arial, sans-serif',
            size: 10,
            color: 'rgba(200,0,0,0.7)'
          },
          bgcolor: 'rgba(255,255,255,0.7)',
          bordercolor: 'rgba(200,0,0,0.3)',
          borderwidth: 1,
          borderpad: is880InRange() ? 1 : 2,
          y: is880InRange() ? 0.95 : 0.98
        },
        // Octave labels if in range
        frequencyRange[1] >= 880 ? {
          x: 880,
          xref: 'x' as const,
          yref: 'paper' as const,
          text: 'A5 (Ля)',
          showarrow: false,
          font: {
            family: 'Arial, sans-serif',
            size: 10,
            color: 'rgba(200,0,0,0.7)'
          },
          bgcolor: 'rgba(255,255,255,0.7)',
          bordercolor: 'rgba(200,0,0,0.3)',
          borderwidth: 1,
          borderpad: 1
        } : null,
        frequencyRange[0] <= 220 ? {
          x: 220,
          xref: 'x' as const,
          yref: 'paper' as const,
          text: 'A3 (Ля)',
          showarrow: false,
          font: {
            family: 'Arial, sans-serif',
            size: 10,
            color: 'rgba(200,0,0,0.7)'
          },
          bgcolor: 'rgba(255,255,255,0.7)',
          bordercolor: 'rgba(200,0,0,0.3)',
          borderwidth: 1,
          borderpad: 1
        } : null,
        // Add peak annotations
        ...peaks.map((peak, index): Partial<Annotations> => ({
          x: peak.frequency,
          y: peak.amplitude,
          text: `${peak.note}`,
          showarrow: true,
          arrowhead: 2,
          arrowsize: 1,
          arrowwidth: 1.5,
          arrowcolor: '#333',
          ax: (index % 2 === 0 ? 20 : -20),
          ay: (index % 2 === 0 ? -20 : -30),
          font: {
            family: 'Arial, sans-serif',
            size: 10,
            color: SCIENTIFIC_COLORS.peaks[index % SCIENTIFIC_COLORS.peaks.length]
          },
          bgcolor: 'rgba(255,255,255,0.8)',
          bordercolor: 'rgba(0,0,0,0.1)',
          borderwidth: 1,
          borderpad: 2,
          xref: 'x' as const,
          yref: 'y' as const
        })).filter(isNotNullOrUndefined)
      ].filter(isNotNullOrUndefined)
    };
  }, [height, frequencyRange, peaks, SCIENTIFIC_COLORS, is880InRange]);

  // Config options for Plotly
  const plotlyConfig = useMemo((): Partial<Config> => ({
    responsive: true,
    displayModeBar: true,
    modeBarButtonsToRemove: [
      'sendDataToCloud' as const, 'toggleSpikelines' as const, 'hoverCompareCartesian' as const,
      // Removed buttons like 'drawline' that caused issues previously
    ],
    displaylogo: false,
    toImageButtonOptions: {
      format: 'svg' as const, // Fix: Add 'as const'
      filename: 'spectral_analysis',
      scale: 2
    }
  }), []);

  return (
    <div className="w-full font-sans">
      <h2 className="text-xl font-semibold mb-4">Спектральный анализ</h2>
      
      {/* Peaks display with scientific styling */}
      {peaks.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 mb-6">
          {peaks.map((peak, index) => {
            const colorIndex = index % SCIENTIFIC_COLORS.peaks.length;
            const color = SCIENTIFIC_COLORS.peaks[colorIndex];
            
            return (
              <div 
                key={`peak-card-${index}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '10px',
                  borderRadius: '6px',
                  backgroundColor: 'white',
                  border: `2px solid ${color}`,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}
              >
                <div style={{ 
                  fontWeight: 600, 
                  fontSize: '14px',
                  color: color,
                  marginBottom: '4px'
                }}>
                  {peak.note} ({peak.nameRu})
                </div>
                <div style={{ 
                  fontWeight: 500,
                  fontSize: '13px', 
                  color: '#333',
                  marginBottom: '2px'
                }}>
                  {peak.frequency.toFixed(1)} Гц
                </div>
                {peak.cents !== 0 && (
                  <div style={{ 
                    fontSize: '12px',
                    color: peak.cents > 0 ? '#d97706' : '#059669',
                    fontStyle: 'italic'
                  }}>
                    {peak.cents > 0 ? '+' : ''}{peak.cents} центов
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      
      {/* Plotly chart with enhanced scientific styling */}
      <div style={{ 
        borderRadius: '8px',
        overflow: 'hidden',
        backgroundColor: '#f8f9fa',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      }}>
        {processedData.length > 0 ? (
          <Plot
            data={plotlyData}
            layout={plotlyLayout}
            config={plotlyConfig}
            style={{ width: '100%', height: '100%' }}
            useResizeHandler={true}
          />
        ) : (
          <div className="flex items-center justify-center" style={{ height: typeof height === 'number' ? height + 'px' : height }}>
            <div className="text-center">
              <svg className="mx-auto h-16 w-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
              <p className="mt-3 text-base text-gray-500">Нет данных для анализа</p>
              <p className="mt-1 text-sm text-gray-400">Выберите ноты и нажмите Проиграть аккорд</p>
            </div>
          </div>
        )}
      </div>
      
      {/* Selected notes with enhanced scientific styling */}
      {selectedNotes.length > 0 && (
        <div className="mt-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
          <h3 className="text-base font-medium text-gray-700 mb-3">Выбранные ноты:</h3>
          <div className="flex flex-wrap gap-2">
            {selectedNotes.map(note => (
              <span 
                key={note} 
                className="px-4 py-2 rounded-md text-sm font-medium flex items-center"
                style={{ 
                  backgroundColor: 'rgba(65, 105, 225, 0.1)', 
                  color: SCIENTIFIC_COLORS.primary,
                  border: '1px solid rgba(65, 105, 225, 0.3)'
                }}
              >
                <span className="mr-2 font-bold">{note}</span>
                <span className="mr-2">({NOTE_NAMES_RU[note.replace(/\d/g, '')]})</span>
                <span className="text-gray-600">{NOTE_FREQUENCIES[note].toFixed(1)} Гц</span>
              </span>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};

export default MusicSpectralChart;