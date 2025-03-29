import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer, ReferenceLine, Label 
} from 'recharts';

/**
 * Interface for a single data point in the spectrum
 */
export interface SpectralPoint {
  harmonic: number;      // The harmonic number or frequency bin
  frequency?: number;    // Optional frequency in Hz
  amplitude: number;     // Amplitude of the frequency component
  type?: string;         // Optional type/category of the point (e.g., "DC", "Harmonic")
}

/**
 * Props for the SpectrumChart component
 */
interface SpectrumChartProps {
  data: SpectralPoint[];                      // The spectral data to visualize
  title?: string;                             // Optional title for the chart
  xAxisLabel?: string;                        // Optional label for the x-axis
  yAxisLabel?: string;                        // Optional label for the y-axis
  showFrequency?: boolean;                    // Whether to show frequency on x-axis (if available)
  maxDisplayPoints?: number;                  // Maximum number of points to display (for performance)
  height?: number | string;                   // Chart height
  thresholdValue?: number;                    // Optional threshold line value
  thresholdLabel?: string;                    // Optional threshold line label
  color?: string;                             // Bar color
  highlightedHarmonics?: number[];            // Optional array of harmonics to highlight
  highlightColor?: string;                    // Color for highlighted harmonics
  tooltipFormatter?: (value: number, name: string, props: any) => [string, string]; // Custom tooltip formatter
}

/**
 * SpectrumChart component - Visualizes frequency spectrum data
 * 
 * This component renders a bar chart showing the amplitude distribution across
 * frequencies or harmonics, useful for audio spectral analysis visualization.
 */
const SpectrumChart: React.FC<SpectrumChartProps> = ({
  data,
  title = "Спектральный анализ",
  xAxisLabel = "Номер гармоники",
  yAxisLabel = "Амплитуда",
  showFrequency = false,
  maxDisplayPoints = 100,
  height = "100%",
  thresholdValue,
  thresholdLabel,
  color = "#8884d8",
  highlightedHarmonics = [],
  highlightColor = "#ff7300",
  tooltipFormatter,
}) => {
  // Prepare and optimize data for visualization
  const prepareChartData = () => {
    // If there's no data, return empty array
    if (!data || data.length === 0) {
      return [];
    }
    
    // If we have more data points than maxDisplayPoints, reduce the number of points
    let displayData = [...data];
    if (data.length > maxDisplayPoints) {
      // Sampling approach: take every nth point to reduce to about maxDisplayPoints
      const samplingRate = Math.ceil(data.length / maxDisplayPoints);
      displayData = data.filter((_, index) => index % samplingRate === 0);
    }
    
    // If frequency information is present, add it to the tooltip and potentially to x-axis
    return displayData.map(point => {
      // Create a new object with properties needed for visualization
      const result: any = {
        harmonic: point.harmonic,
        amplitude: point.amplitude,
        // Add frequency if available
        ...(point.frequency !== undefined && { frequency: point.frequency }),
        // Add original type if available
        ...(point.type && { type: point.type }),
        // Add flag for highlighted points
        ...(highlightedHarmonics.includes(point.harmonic) && { highlighted: true }),
      };
      
      return result;
    });
  };
  
  // Prepare the data for rendering
  const chartData = prepareChartData();
  
  // Default tooltip formatter if not provided
  const defaultTooltipFormatter = (value: number, name: string, props: any) => {
    // Format the value to 2 decimal places
    const formattedValue = value.toFixed(2);
    
    // If frequency is available and showFrequency is true, include it in the tooltip
    if (props.payload.frequency !== undefined && showFrequency) {
      return [`${formattedValue} (${props.payload.frequency.toFixed(2)} Hz)`, name];
    }
    
    return [formattedValue, name];
  };
  
  // Custom bar props to apply different colors for highlighted harmonics
  const getBarProps = (entry: any) => {
    if (entry.highlighted) {
      return { fill: highlightColor };
    }
    return { fill: color };
  };
  
  return (
    <div className="w-full">
      {title && <h2 className="text-xl font-semibold mb-4">{title}</h2>}
      
      <div style={{ width: '100%', height: height }}>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              
              {/* X-axis configuration */}
              <XAxis 
                dataKey={showFrequency && chartData[0]?.frequency !== undefined ? "frequency" : "harmonic"} 
                type="number"
                domain={['dataMin', 'dataMax']} 
              >
                <Label 
                  value={showFrequency ? "Частота (Гц)" : xAxisLabel} 
                  position="insideBottom" 
                  offset={-10} 
                />
              </XAxis>
              
              {/* Y-axis configuration */}
              <YAxis>
                <Label 
                  value={yAxisLabel} 
                  angle={-90} 
                  position="insideLeft" 
                  style={{ textAnchor: 'middle' }} 
                />
              </YAxis>
              
              {/* Tooltip for data point information */}
              <Tooltip 
                formatter={tooltipFormatter || defaultTooltipFormatter}
                labelFormatter={(label) => showFrequency ? `Частота: ${label} Гц` : `Гармоника: ${label}`}
              />
              
              <Legend />
              
              {/* Threshold reference line if provided */}
              {thresholdValue !== undefined && (
                <ReferenceLine 
                  y={thresholdValue} 
                  stroke="red" 
                  strokeDasharray="3 3"
                  label={{ 
                    value: thresholdLabel || `Порог: ${thresholdValue}`,
                    position: 'right',
                    fill: 'red' 
                  }} 
                />
              )}
              
              {/* Zero reference line */}
              <ReferenceLine y={0} stroke="#000" />
              
              {/* The actual spectral data bars */}
              <Bar 
                dataKey="amplitude" 
                name="Амплитуда" 
                isAnimationActive={false} // Disable animation for better performance with large datasets
                {...getBarProps} // Apply different colors based on highlight status
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full w-full text-gray-500">
            Нет данных для отображения. Сгенерируйте сигнал или выберите ноты для анализа.
          </div>
        )}
      </div>
    </div>
  );
};

export default SpectrumChart;