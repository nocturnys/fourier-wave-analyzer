import React, { useMemo, useCallback } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer, ReferenceLine 
} from 'recharts';
import { WavePoint } from '@/utils/waveGenerators';
// Import specific types from recharts

import { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';

/**
 * Props interface for the HarmonicComparisonChart component
 */
interface HarmonicComparisonChartProps {
  originalData: WavePoint[];                  // Original wave data
  reconstructions: Array<{                    // Array of reconstructed waves with different harmonics
    data: WavePoint[];
    harmonics: number;
  }>;           
  idealData?: WavePoint[];                    // Optional ideal wave form (e.g., perfect square wave)
  duration: number;                           // Duration of the wave in seconds
  amplitude: number;                          // Maximum amplitude
  height?: number | string;                   // Chart height
  title?: string;                             // Chart title
}

/**
 * Helper function to find closest index in array - optimized with binary search
 */
const findClosestPointIndex = (points: WavePoint[], time: number): number => {
  if (!points || points.length === 0) return -1;
  
  // Handle edge cases immediately
  if (time <= points[0].t) return 0;
  if (time >= points[points.length - 1].t) return points.length - 1;
  
  // Binary search
  let left = 0;
  let right = points.length - 1;
  
  while (right - left > 1) {
    const mid = Math.floor((left + right) / 2);
    if (points[mid].t < time) {
      left = mid;
    } else {
      right = mid;
    }
  }
  
  // Return closest of the two candidates
  return Math.abs(points[left].t - time) < Math.abs(points[right].t - time) ? left : right;
};

/**
 * Component for visualizing multiple wave reconstructions with different numbers of harmonics
 */
const HarmonicComparisonChart: React.FC<HarmonicComparisonChartProps> = ({
  originalData,
  reconstructions,
  idealData,
  duration,
  amplitude,
  height = 400,
  title = "Сравнение аппроксимаций с разным числом гармоник"
}) => {
  // Prepare all the data series for visualization with optimized rendering
  const chartData = useMemo(() => {
    if (!originalData || originalData.length === 0) {
      return [];
    }

    // Adaptive sampling rate based on data size
    const targetDataPoints = 500; // Maximum number of points to display for performance
    const samplingStep = Math.max(1, Math.ceil(originalData.length / targetDataPoints));
    
    // Combined data for chart with pre-allocated space
    const combinedData: Array<{
      t: number;
      original?: number;
      ideal?: number;
      [key: string]: number | undefined;
    }> = new Array(Math.ceil(originalData.length / samplingStep));
    
    // Sample the original data with efficient allocation
    let dataIndex = 0;
    for (let i = 0; i < originalData.length; i += samplingStep) {
      const point = originalData[i];
      
      // Fix: Define type for dataPoint explicitly
      const dataPoint: { t: number; original?: number; ideal?: number; [key: string]: number | undefined } = {
        t: point.t,
        original: point.value,
      };
      
      // Add ideal wave value if available
      if (idealData && idealData.length > 0) {
        // Find closest point in idealData
        const idealIndex = findClosestPointIndex(idealData, point.t);
        if (idealIndex >= 0) {
          dataPoint.ideal = idealData[idealIndex].value;
        }
      }
      
      combinedData[dataIndex++] = dataPoint;
    }
    
    // Truncate if we allocated too much space
    if (dataIndex < combinedData.length) {
      combinedData.length = dataIndex;
    }
    
    // Process reconstructions in batches for better performance
    const batchSize = 100;
    // Sort reconstructions to process smaller datasets first (faster)
    const sortedReconstructions = [...reconstructions].sort(
      (a, b) => a.data.length - b.data.length
    );
    
    for (const reconstruction of sortedReconstructions) {
      const harmonicKey = `harmonics_${reconstruction.harmonics}`;
      
      // Process in batches
      for (let batchStart = 0; batchStart < combinedData.length; batchStart += batchSize) {
        const batchEnd = Math.min(batchStart + batchSize, combinedData.length);
        
        for (let i = batchStart; i < batchEnd; i++) {
          const t = combinedData[i].t;
          
          // Find closest point in reconstruction
          const reconIndex = findClosestPointIndex(reconstruction.data, t);
          if (reconIndex >= 0) {
            combinedData[i][harmonicKey] = reconstruction.data[reconIndex].value;
          }
        }
      }
    }
    
    return combinedData;
  }, [originalData, reconstructions, idealData]);

  // Define chart colors for each data series - memoized to avoid recreation
  const colors = useMemo(() => ({
    original: "#000000",
    ideal: "#000000",
    harmonics_1: "#3182CE", // Blue
    harmonics_3: "#F6AD55", // Orange
    harmonics_5: "#68D391", // Green
    harmonics_10: "#4FD1C5", // Teal
    harmonics_20: "#F687B3", // Pink
    harmonics_30: "#FC8181", // Red
    harmonics_50: "#B794F4"  // Purple
  }), []);

  // Custom tooltip formatter with proper types
  const formatTooltip = useCallback((value: ValueType, name: NameType) => {
    // value might be string, number, or array; name might be string or number
    const numValue = Number(value); // Convert value to number for formatting
    const strName = String(name); // Convert name to string for checks

    if (isNaN(numValue)) {
        return [strName, String(value)]; // Return original if value isn't a number
    }

    if (strName === "original") {
      return ["Оригинал", numValue.toFixed(2)];
    } else if (strName === "ideal") {
      return ["Идеальная волна", numValue.toFixed(2)];
    } else if (strName.startsWith("harmonics_")) {
      const harmonics = strName.split("_")[1];
      return [`${harmonics} гармоник`, numValue.toFixed(2)];
    }
    return [strName, numValue.toFixed(2)];
  }, []);

  // Calculate y-axis domain with some padding
  const yDomain = useMemo(() => {
    // Add a 20% margin to amplitude for better visualization
    return [-amplitude * 1.2, amplitude * 1.2];
  }, [amplitude]);

  // Style for the chart legend
  const legendStyle = {
    fontSize: '12px'
  };

  // Tick formatter for x-axis - optimized with useCallback
  const formatXTick = useCallback((value: number) => value.toFixed(2), []);
  
  // Label formatter for tooltip with proper type
  const labelFormatter = useCallback((label: number | string) => `Время: ${Number(label).toFixed(3)} с`, []);

  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold mb-4">{title}</h2>
      
      <div style={{ width: '100%', height: height }}>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 10, right: 30, left: 20, bottom: 30 }}
            >
              <CartesianGrid strokeDasharray="3 3" opacity={0.7} />
              
              <XAxis 
                dataKey="t" 
                type="number"
                domain={[0, duration]}
                label={{ value: 'Время (t)', position: 'insideBottomRight', offset: -5 }}
                tickFormatter={formatXTick}
              />
              
              <YAxis
                domain={yDomain}
                label={{ value: 'Амплитуда', angle: -90, position: 'insideLeft' }}
              />
              
              <Tooltip 
                formatter={formatTooltip}
                labelFormatter={labelFormatter}
              />
              
              <Legend 
                wrapperStyle={legendStyle}
                verticalAlign="top"
                align="right"
              />
              
              <ReferenceLine y={0} stroke="#666" strokeWidth={0.5} />
              
              {/* Ideal wave if available */}
              {idealData && idealData.length > 0 && (
                <Line
                  type="linear"
                  dataKey="ideal"
                  stroke={colors.ideal}
                  strokeWidth={1.5}
                  strokeDasharray="5 5"
                  dot={false}
                  name="Идеальная форма волны"
                  isAnimationActive={false}
                />
              )}
              
              {/* Reconstructed waves with different harmonics */}
              {reconstructions.map(reconstruction => (
                <Line
                  key={`harmonics_${reconstruction.harmonics}`}
                  type="linear"
                  dataKey={`harmonics_${reconstruction.harmonics}`}
                  stroke={colors[`harmonics_${reconstruction.harmonics}` as keyof typeof colors] || "#999"}
                  strokeWidth={1.5}
                  dot={false}
                  name={`${reconstruction.harmonics} гармоник${reconstruction.harmonics > 4 ? "" : "и"}`}
                  isAnimationActive={false}
                />
              ))}
              
              {/* Original wave last to keep it on top */}
              <Line
                type="linear"
                dataKey="original"
                stroke={colors.original}
                strokeWidth={1}
                strokeDasharray="3 3"
                dot={false}
                name="Исходный сигнал"
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full w-full bg-gray-100 rounded-lg">
            <p className="text-gray-500">Нет данных для отображения</p>
          </div>
        )}
      </div>
      
      <div className="mt-2 text-sm text-gray-600">
        <p>График показывает, как увеличение числа гармоник улучшает аппроксимацию исходного сигнала.</p>
        <p>Для прямоугольной и пилообразной волн требуется больше гармоник для точного воспроизведения острых переходов.</p>
      </div>
    </div>
  );
};

// Use React.memo to prevent unnecessary re-renders
export default React.memo(HarmonicComparisonChart);