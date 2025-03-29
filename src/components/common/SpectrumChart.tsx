import React, { useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer, ReferenceLine
} from 'recharts';

export interface SpectralPoint {
  harmonic: number;
  frequency?: number;
  amplitude: number;
  type?: string;
}

interface SpectrumChartProps {
  data: SpectralPoint[];
  title?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  showFrequency?: boolean;
  maxDisplayPoints?: number;
  height?: number | string;
  thresholdValue?: number;
  thresholdLabel?: string;
  color?: string;
  highlightedHarmonics?: number[];
  highlightColor?: string;
}

const SpectrumChart: React.FC<SpectrumChartProps> = ({
  data,
  title = "Спектральный анализ",
  xAxisLabel = "Номер гармоники",
  yAxisLabel = "Амплитуда",
  showFrequency = false,
  maxDisplayPoints = 50,
  height = 300,
  thresholdValue,
  thresholdLabel,
  color = "#4f46e5",
  highlightedHarmonics = [],
  highlightColor = "#ff7300",
}) => {
  // Use useMemo instead of useState + useEffect to avoid infinite loops
  const chartData = useMemo(() => {
    if (!data || data.length === 0) {
      return [];
    }
    
    // Process data for display
    let displayData = [...data];
    if (data.length > maxDisplayPoints) {
      const samplingRate = Math.ceil(data.length / maxDisplayPoints);
      displayData = data.filter((_, index) => index % samplingRate === 0);
    }
    
    // Add highlighted flag for special harmonics
    return displayData.map(point => ({
      ...point,
      highlighted: highlightedHarmonics.includes(point.harmonic)
    }));
  }, [data, maxDisplayPoints, highlightedHarmonics]);

  // Custom tooltip formatter
  const tooltipFormatter = (value: number) => {
    return [value.toFixed(2), "Амплитуда"];
  };

  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold mb-4">{title}</h2>
      
      <div style={{ width: '100%', height: height }}>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="harmonic"
                label={{ value: xAxisLabel, position: 'bottom', offset: 0 }}
              />
              <YAxis 
                label={{ value: yAxisLabel, angle: -90, position: 'insideLeft' }}
              />
              <Tooltip 
                formatter={tooltipFormatter}
                labelFormatter={(label) => `Гармоника: ${label}`}
              />
              <Legend />
              <ReferenceLine y={0} stroke="#000" />
              <Bar 
                dataKey="amplitude" 
                name="Амплитуда"
                fill={color}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full w-full bg-gray-100 rounded-lg border">
            <p className="text-gray-500">Нет данных для отображения спектра</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(SpectrumChart);