import React, { useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, ReferenceLine
} from 'recharts';
import { SpectralPoint } from '@/utils/fourierTransform';
import { NOTE_FREQUENCIES, NOTE_NAMES_RU } from '@/constants/noteFrequencies';

interface MusicSpectralChartProps {
  data: SpectralPoint[];
  selectedNotes: string[];
  height?: number | string;
}

/**
 * Enhanced spectral analysis visualization optimized for complex chords with multiple notes
 */
const MusicSpectralChart: React.FC<MusicSpectralChartProps> = ({
  data,
  selectedNotes,
  height = 340
}) => {
  // Process spectral data with optimized peak detection
  const { chartData, peaks, maxFrequency } = useMemo(() => {
    if (!data || data.length === 0) return { 
      chartData: [], 
      peaks: [],
      maxFrequency: 1000
    };
    
    // Process data points
    const filteredData = data
      .filter(point => point.frequency !== undefined)
      .sort((a, b) => (a.frequency || 0) - (b.frequency || 0));
    
    const processedData = filteredData.map(point => ({
      frequency: point.frequency,
      amplitude: point.amplitude,
      note: Object.entries(NOTE_FREQUENCIES).find(
        ([_, freq]) => Math.abs((point.frequency || 0) - freq) < 3
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
            deviation: centsText ? `(${centsText} значений)` : '',
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
    
    // Calculate an appropriate frequency range
    const highestPeakFreq = Math.max(...sortedPeaks.map(p => p.frequency), 500);
    const lowestPeakFreq = Math.min(...sortedPeaks.map(p => p.frequency), 0);
    const range = highestPeakFreq - lowestPeakFreq;
    
    // Calculate buffer based on range (wider range = more buffer)
    const bufferPercentage = Math.min(0.3, Math.max(0.15, 50 / range));
    const buffer = range * bufferPercentage;
    
    // Calculate nice round values for min/max frequency
    const minFreq = Math.max(0, Math.floor((lowestPeakFreq - buffer) / 100) * 100);
    const maxFreq = Math.min(2000, Math.ceil((highestPeakFreq + buffer) / 100) * 100);
    
    return { 
      chartData: processedData,
      peaks: sortedPeaks,
      maxFrequency: maxFreq,
      minFrequency: minFreq
    };
  }, [data]);

  // Formatter for frequency axis
  const formatFrequency = (value: number) => {
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}kHz`;
    }
    return `${Math.round(value)}Hz`;
  };
  
  // Smart color assignment - maintain hue distinctiveness even with many notes
  const getPeakColors = useMemo(() => {
    // Base colors for up to 5 peaks
    const baseColors = [
      { bg: '#FF453A', lighter: '#FFE5E5', text: '#9A0000' },  // Red
      { bg: '#FF9F0A', lighter: '#FFF4E5', text: '#954F00' },  // Orange
      { bg: '#30D158', lighter: '#E3FBE9', text: '#0A541F' },  // Green
      { bg: '#64D2FF', lighter: '#E5F6FF', text: '#004A77' },  // Blue
      { bg: '#BF5AF2', lighter: '#F5E9FF', text: '#5B1E77' }   // Purple
    ];
    
    // For many peaks, create a more varied color palette
    if (peaks.length > 5) {
      // Generate extended colors by interpolating
      return peaks.map((_, index) => {
        const hue = (index * (360 / peaks.length)) % 360;
        // Create different saturation levels for alternating notes
        const saturation = index % 2 === 0 ? '90%' : '75%';
        const lightness = index % 2 === 0 ? '50%' : '45%';
        const lighterLightness = '95%';
        
        return {
          bg: `hsl(${hue}, ${saturation}, ${lightness})`,
          lighter: `hsl(${hue}, 30%, ${lighterLightness})`,
          text: `hsl(${hue}, ${saturation}, 25%)`
        };
      });
    }
    
    return baseColors;
  }, [peaks.length]);

  // Custom tooltip component
  const renderTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    
    const data = payload[0].payload;
    const freq = data.frequency;
    const amp = data.amplitude;
    
    // Find closest musical note
    const closestNote = Object.entries(NOTE_FREQUENCIES).reduce(
      (closest, [note, noteFreq]) => {
        const diff = Math.abs(freq - noteFreq);
        return diff < closest.diff ? { note, diff } : closest;
      },
      { note: '', diff: Infinity }
    );
    
    // Calculate cents deviation
    let centsInfo = '';
    if (closestNote.diff < 15) {
      const exactCents = 1200 * Math.log2(freq / NOTE_FREQUENCIES[closestNote.note]);
      const cents = Math.round(exactCents);
      centsInfo = cents === 0 ? '' : ` (${cents > 0 ? '+' : ''}${cents} центов)`;
    }
    
    const noteName = closestNote.diff < 15 
      ? `${closestNote.note} (${NOTE_NAMES_RU[closestNote.note.replace(/\d/g, '')]}${centsInfo})` 
      : '';

    return (
      <div style={{ 
        background: 'rgba(255,255,255,0.95)', 
        backdropFilter: 'blur(10px)',
        boxShadow: '0 2px 14px rgba(0,0,0,0.12)',
        border: 'none',
        borderRadius: '10px',
        padding: '12px 14px',
        fontSize: '13px'
      }}>
        <p style={{ fontWeight: 600, marginBottom: '8px' }}>
          Частота: {freq.toFixed(2)} Гц
        </p>
        <p style={{ color: '#666', marginBottom: '6px' }}>
          Амплитуда: {amp.toFixed(6)}
        </p>
        {noteName && (
          <p style={{ 
            fontWeight: 500,
            color: '#0066CC',
            marginTop: '6px',
            paddingTop: '6px',
            borderTop: '1px solid rgba(0,0,0,0.1)'
          }}>
            {noteName}
          </p>
        )}
      </div>
    );
  };

  // Calculate optimal tick intervals for frequency axis
  const getFrequencyTicks = useMemo(() => {
    const max = maxFrequency;
    let step;
    
    if (max > 1500) step = 500;
    else if (max > 1000) step = 250;
    else if (max > 500) step = 100;
    else if (max > 200) step = 50;
    else step = 25;
    
    const ticks = [];
    for (let i = 0; i <= max; i += step) {
      ticks.push(i);
    }
    
    return ticks;
  }, [maxFrequency]);

  // Layout optimization for many peaks
  const renderPeakCards = () => {
    // For many peaks, use a more compact grid layout
    if (peaks.length > 5) {
      return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
          {peaks.map((peak, index) => {
            const colorSet = getPeakColors[index % getPeakColors.length];
            
            return (
              <div 
                key={`peak-card-${index}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  backgroundColor: colorSet.lighter,
                  color: colorSet.text,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                  border: `1px solid ${colorSet.bg}30`,
                }}
              >
                <div style={{ width: '100%' }}>
                  <div style={{ 
                    fontWeight: 600, 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span>{peak.note} ({peak.nameRu})</span>
                    <span 
                      style={{ 
                        width: '8px', 
                        height: '8px', 
                        borderRadius: '50%', 
                        backgroundColor: colorSet.bg,
                        flexShrink: 0,
                        marginLeft: '4px'
                      }}
                    />
                  </div>
                  <div style={{ 
                    fontSize: '12px', 
                    opacity: 0.9,
                    display: 'flex',
                    justifyContent: 'space-between'
                  }}>
                    <span>{peak.frequency.toFixed(1)}Гц</span>
                    {peak.cents !== 0 && (
                      <span style={{ marginLeft: '4px', color: peak.cents > 0 ? '#FF9F0A' : '#30D158' }}>
                        {peak.cents > 0 ? '+' : ''}{peak.cents}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      );
    }
    
    // For fewer peaks, use the original horizontal layout
    return (
      <div className="flex flex-wrap gap-2 mb-4">
        {peaks.map((peak, index) => {
          const colorSet = getPeakColors[index % getPeakColors.length];
          
          return (
            <div 
              key={`peak-card-${index}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 12px',
                borderRadius: '8px',
                backgroundColor: colorSet.bg,
                color: 'white',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{peak.note} ({peak.nameRu})</div>
                <div style={{ fontSize: '12px', opacity: 0.9 }}>
                  {peak.frequency.toFixed(1)}Гц
                  {peak.cents !== 0 && (
                    <span style={{ marginLeft: '4px' }}>
                      ({peak.cents > 0 ? '+' : ''}{peak.cents} значений)
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="w-full font-sans">
      <h2 className="text-xl font-semibold mb-4">Спектральный анализ</h2>
      
      {/* Adaptive Peak Cards Layout */}
      {peaks.length > 0 && renderPeakCards()}
      
      <div style={{ 
        width: '100%', 
        height, 
        position: 'relative',
        borderRadius: '10px',
        overflow: 'hidden',
        backgroundColor: '#f8f9fa',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 20, bottom: 30 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.07)" />
              
              {/* X-axis (Frequency) with optimized range */}
              <XAxis 
                dataKey="frequency" 
                type="number"
                domain={[0, maxFrequency]}
                ticks={getFrequencyTicks}
                tickFormatter={formatFrequency}
                tickMargin={8}
                tick={{ fontSize: 11, fill: '#666' }}
                padding={{ left: 10, right: 10 }}
                stroke="#ccc"
                label={{ 
                  value: 'Частота', 
                  position: 'insideBottom',
                  offset: -15,
                  style: { 
                    textAnchor: 'middle', 
                    fontSize: 12, 
                    fill: '#666' 
                  }
                }}
              />
              
              {/* Y-axis (Amplitude) */}
              <YAxis 
                type="number"
                domain={[0, 'auto']}
                tickFormatter={(value) => value.toFixed(4)}
                tick={{ fontSize: 11, fill: '#666' }}
                width={60}
                orientation="left"
                stroke="#ccc"
                label={{ 
                  value: 'Амплитуда', 
                  angle: -90, 
                  position: 'insideLeft',
                  offset: -10,
                  style: { 
                    textAnchor: 'middle', 
                    fontSize: 12, 
                    fill: '#666' 
                  }
                }}
              />

              <Tooltip content={renderTooltip} />
              
              {/* Premium gradient */}
              <defs>
                <linearGradient id="blueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="rgba(10,132,255,0.7)"/>
                  <stop offset="95%" stopColor="rgba(10,132,255,0.05)"/>
                </linearGradient>
              </defs>
              
              {/* Area visualization */}
              <Area
                type="monotone"
                dataKey="amplitude"
                stroke="#0A84FF"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#blueGradient)"
                dot={false}
                activeDot={{ 
                  r: 5, 
                  stroke: 'white', 
                  strokeWidth: 2, 
                  fill: '#0A84FF' 
                }}
                isAnimationActive={false}
              />
              
              {/* Vertical lines for peaks */}
              {peaks.map((peak, index) => {
                const colorSet = getPeakColors[index % getPeakColors.length];
                
                return (
                  <ReferenceLine
                    key={`peak-line-${index}`}
                    x={peak.frequency}
                    stroke={colorSet.bg}
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                    ifOverflow="extendDomain"
                  />
                );
              })}
              
              {/* Selected notes reference lines */}
              {selectedNotes.map((note) => (
                <ReferenceLine 
                  key={`selected-note-${note}`}
                  x={NOTE_FREQUENCIES[note]} 
                  stroke="rgba(10,132,255,0.3)" 
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  ifOverflow="extendDomain"
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full">
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
      
      {/* Selected Notes */}
      {selectedNotes.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Выбранные ноты:</h3>
          <div className="flex flex-wrap gap-2">
            {selectedNotes.map(note => (
              <span key={note} className="px-4 py-1.5 bg-blue-100 text-blue-800 rounded-md text-sm font-medium">
                {note} ({NOTE_NAMES_RU[note.replace(/\d/g, '')]}) {NOTE_FREQUENCIES[note].toFixed(1)} Гц
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MusicSpectralChart;