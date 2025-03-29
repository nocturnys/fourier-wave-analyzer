import React, { useMemo } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer, ReferenceLine 
} from 'recharts';
import { WavePoint } from '@/utils/waveGenerators';

/**
 * Props interface for the WaveChart component
 */
interface WaveChartProps {
  data: WavePoint[];                   // Array of points representing the waveform
  title: string;                       // Chart title
  color?: string;                      // Line color for the waveform
  duration: number;                    // Time duration represented in the chart (seconds)
  amplitude: number;                   // Maximum expected amplitude value
  showPoints?: boolean;                // Whether to show points on the line
  showGrid?: boolean;                  // Whether to show the grid
  timeRange?: [number, number];        // Optional specific time range to display
  compareData?: WavePoint[];           // Optional second dataset for comparison
  compareColor?: string;               // Color for the comparison dataset
  highlightRanges?: Array<{            // Optional time ranges to highlight
    start: number;
    end: number;
    color: string;
    label?: string;
  }>;
  height?: number | string;            // Chart height
  xAxisLabel?: string;                 // X-axis label
  yAxisLabel?: string;                 // Y-axis label
}

/**
 * WaveChart component - Visualizes time-domain waveforms
 * 
 * This component renders a line chart showing amplitude changes over time,
 * optimized for audio waveform visualization with various customization options.
 */
const WaveChart: React.FC<WaveChartProps> = ({
  data,
  title,
  color = "#8884d8",
  duration,
  amplitude,
  showPoints = false,
  showGrid = true,
  timeRange,
  compareData,
  compareColor = "#82ca9d",
  highlightRanges = [],
  height = "100%",
  xAxisLabel = "Время (с)",
  yAxisLabel = "Амплитуда",
}) => {
  // Prepare data for visualization with optimized rendering
  const preparedData = useMemo(() => {
    if (!data || data.length === 0) {
      return [];
    }

    // If we have a very large dataset, sample it to improve performance
    let displayData = [...data];
    const maxPoints = 1000; // Maximum number of points to render for performance
    
    if (data.length > maxPoints) {
      // Calculate sampling rate
      const samplingRate = Math.ceil(data.length / maxPoints);
      displayData = data.filter((_, index) => index % samplingRate === 0);
    }
    
    // Apply time range filtering if specified
    if (timeRange) {
      const [start, end] = timeRange;
      displayData = displayData.filter(point => point.t >= start && point.t <= end);
    }
    
    return displayData;
  }, [data, timeRange]);
  
  // Similarly prepare comparison data if provided
  const preparedCompareData = useMemo(() => {
    if (!compareData || compareData.length === 0) {
      return [];
    }
    
    let displayData = [...compareData];
    const maxPoints = 1000;
    
    if (compareData.length > maxPoints) {
      const samplingRate = Math.ceil(compareData.length / maxPoints);
      displayData = compareData.filter((_, index) => index % samplingRate === 0);
    }
    
    if (timeRange) {
      const [start, end] = timeRange;
      displayData = displayData.filter(point => point.t >= start && point.t <= end);
    }
    
    return displayData;
  }, [compareData, timeRange]);
  
  // Calculate the actual domain values for x and y axes
  const xDomain = useMemo(() => {
    return timeRange || [0, duration];
  }, [duration, timeRange]);
  
  const yDomain = useMemo(() => {
    // Add a 10% margin to amplitude for better visualization
    return [-amplitude * 1.1, amplitude * 1.1];
  }, [amplitude]);
  
  // Custom tooltip formatter to show time and amplitude with appropriate precision
  const formatTooltip = (value: number, name: string, props: any) => {
    if (name === "value") {
      return [`${value.toFixed(2)}`, "Амплитуда"];
    }
    return [value, name];
  };
  
  // Custom label formatter for the x-axis to show time in seconds
  const formatXAxisTick = (value: number) => {
    return value.toFixed(3);
  };
  
  // Calculate the highlighted areas for rendering
  const renderHighlightAreas = () => {
    return highlightRanges.map((range, index) => {
      // Find data points within the highlight range
      const highlightData = preparedData.filter(
        point => point.t >= range.start && point.t <= range.end
      );
      
      if (highlightData.length === 0) return null;
      
      return (
        <rect
          key={`highlight-${index}`}
          x={`${(range.start / duration) * 100}%`}
          width={`${((range.end - range.start) / duration) * 100}%`}
          y="0%"
          height="100%"
          fill={range.color}
          fillOpacity={0.2}
        />
      );
    });
  };
  
  // Calculate the RMS (Root Mean Square) value of the waveform
  // as a measure of signal power
  const calculateRMS = (waveData: WavePoint[]) => {
    if (waveData.length === 0) return 0;
    
    const sumSquares = waveData.reduce((sum, point) => sum + point.value * point.value, 0);
    return Math.sqrt(sumSquares / waveData.length);
  };
  
  // Calculate the peak-to-peak amplitude (maximum range)
  const calculatePeakToPeak = (waveData: WavePoint[]) => {
    if (waveData.length === 0) return 0;
    
    const max = Math.max(...waveData.map(point => point.value));
    const min = Math.min(...waveData.map(point => point.value));
    return max - min;
  };
  
  // Main metrics for the waveform
  const rmsValue = calculateRMS(data);
  const peakToPeak = calculatePeakToPeak(data);
  
  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-xl font-semibold">{title}</h2>
        
        {/* Optional metrics display */}
        <div className="text-sm text-gray-600">
          <span className="mr-3">RMS: {rmsValue.toFixed(2)}</span>
          <span>Размах: {peakToPeak.toFixed(2)}</span>
        </div>
      </div>
      
      <div style={{ width: '100%', height: height, position: 'relative' }}>
        {preparedData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={preparedData}
              margin={{ top: 5, right: 30, left: 20, bottom: 20 }}
            >
              {/* Render highlight areas first so they're behind the grid */}
              {highlightRanges.length > 0 && (
                <defs>
                  <clipPath id="chartArea">
                    <rect x="0" y="0" width="100%" height="100%" />
                  </clipPath>
                </defs>
              )}
              
              {showGrid && <CartesianGrid strokeDasharray="3 3" />}
              
              {/* X-axis configuration */}
              <XAxis 
                dataKey="t" 
                type="number"
                domain={xDomain}
                tickFormatter={formatXAxisTick}
              >
                <label 
                  value={xAxisLabel} 
                  position="insideBottom" 
                  offset={-10}
                />
              </XAxis>
              
              {/* Y-axis configuration */}
              <YAxis
                domain={yDomain}
                tickFormatter={(value) => value.toFixed(0)}
              >
                <label 
                  value={yAxisLabel} 
                  angle={-90} 
                  position="insideLeft" 
                  style={{ textAnchor: 'middle' }} 
                />
              </YAxis>
              
              <Tooltip formatter={formatTooltip} />
              <Legend />
              
              {/* Zero reference line */}
              <ReferenceLine y={0} stroke="#000" />
              
              {/* RMS reference lines */}
              <ReferenceLine 
                y={rmsValue} 
                stroke="#ff7300" 
                strokeDasharray="3 3" 
                label={{ value: "RMS", position: 'right', fill: '#ff7300' }} 
              />
              <ReferenceLine 
                y={-rmsValue} 
                stroke="#ff7300" 
                strokeDasharray="3 3" 
              />
              
              {/* Main waveform line */}
              <Line
                type="linear"
                dataKey="value"
                stroke={color}
                dot={showPoints}
                name="Амплитуда"
                isAnimationActive={false} // Disable animation for better performance
              />
              
              {/* Comparison waveform if provided */}
              {preparedCompareData.length > 0 && (
                <Line
                  type="linear"
                  data={preparedCompareData}
                  dataKey="value"
                  stroke={compareColor}
                  dot={showPoints}
                  name="Сравнение"
                  isAnimationActive={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full w-full text-gray-500">
            Нет данных для отображения. Сгенерируйте сигнал для анализа.
          </div>
        )}
        
        {/* Render highlight areas on top of the chart if needed */}
        {preparedData.length > 0 && highlightRanges.length > 0 && (
          <div 
            className="absolute top-0 left-0 w-full h-full pointer-events-none"
            style={{ clipPath: "url(#chartArea)" }}
          >
            {renderHighlightAreas()}
          </div>
        )}
      </div>
    </div>
  );
};

export default WaveChart;