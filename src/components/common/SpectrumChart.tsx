import React, { useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer, ReferenceLine, LabelList, Cell
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
  useLogScale?: boolean;
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
  useLogScale = false,
}) => {
  // Используем useMemo для оптимизации обработки данных
  const chartData = useMemo(() => {
    if (!data || data.length === 0) {
      return [];
    }
    
    // Находим максимальную амплитуду для нормализации
    const maxAmplitude = Math.max(...data.map(item => item.amplitude));
    
    // Минимальное значение для логарифмической шкалы (чтобы избежать log(0))
    const minAmplitudeLog = maxAmplitude * 0.001;
    
    // Обработка данных для отображения
    let processedData = data.map(point => ({
      ...point,
      // Добавляем нормализованную амплитуду для улучшения визуализации
      normalizedAmplitude: point.amplitude / maxAmplitude,
      // Рассчитываем логарифмическую амплитуду для лучшего отображения малых значений
      logAmplitude: Math.max(point.amplitude, minAmplitudeLog),
      // Отмечаем выделенные гармоники
      highlighted: highlightedHarmonics.includes(point.harmonic)
    }));
    
    // Оптимизируем количество отображаемых точек если их слишком много
    if (processedData.length > maxDisplayPoints) {
      // Для спектрального анализа лучше отображать гармоники с наибольшими амплитудами
      // Вместо простого прореживания данных
      processedData = processedData
        .sort((a, b) => b.amplitude - a.amplitude)
        .slice(0, maxDisplayPoints);
      
      // И сортируем обратно по номеру гармоники для корректного отображения
      processedData.sort((a, b) => a.harmonic - b.harmonic);
    }
    
    return processedData;
  }, [data, maxDisplayPoints, highlightedHarmonics]);

  // Вычисляем максимальную и минимальную амплитуды для настройки оси Y
  const maxYValue = useMemo(() => {
    if (chartData.length === 0) return 1;
    return Math.max(...chartData.map(item => item.amplitude)) * 1.1; // +10% для отступа
  }, [chartData]);

  // Определяем домен для оси Y с учетом логарифмической шкалы
  const yDomain = useMemo(() => {
    if (useLogScale) {
      // Для логарифмической шкалы используем минимальное значение > 0
      const minNonZero = Math.min(...chartData.filter(d => d.amplitude > 0).map(d => d.amplitude));
      return [minNonZero * 0.1, maxYValue];
    }
    return [0, maxYValue];
  }, [chartData, maxYValue, useLogScale]);

  // Пользовательский форматтер для подсказок при наведении
  const tooltipFormatter = (value: number, name: string, props: any) => {
    if (name === "amplitude") {
      return [`${value.toFixed(2)}`, "Амплитуда"];
    }
    return [value, name];
  };

  // Пользовательский форматтер для меток
  const labelFormatter = (label: number) => {
    return `Гармоника: ${label}`;
  };

  // Функция для определения цвета столбца в зависимости от номера гармоники
  const getBarColor = (entry: any, index: number) => {
    if (entry.highlighted) return highlightColor;
    
    // Чередование оттенков для четных и нечетных гармоник
    // Делает график более читаемым
    return entry.harmonic % 2 === 0 ? color : `${color}99`;
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
              barCategoryGap={1} // Уменьшаем расстояние между столбцами
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="harmonic"
                label={{ value: xAxisLabel, position: 'bottom', offset: 0 }}
                type="number" // Используем числовую ось для корректного отображения
                domain={[0, 'dataMax']} // Автоматически определяем диапазон
                allowDecimals={false} // Только целые числа для гармоник
                // Настраиваем количество делений на оси X
                ticks={[...Array(Math.min(10, Math.max(...chartData.map(d => d.harmonic))))].map((_, i) => i * Math.ceil(Math.max(...chartData.map(d => d.harmonic)) / 10))}
              />
              <YAxis 
                label={{ value: yAxisLabel, angle: -90, position: 'insideLeft' }}
                domain={yDomain}
                scale={useLogScale ? 'log' : 'linear'} // Опция логарифмической шкалы
                allowDataOverflow={false}
              />
              <Tooltip 
                formatter={tooltipFormatter}
                labelFormatter={labelFormatter}
                cursor={{ fill: 'rgba(0, 0, 0, 0.1)' }} // Полупрозрачный курсор для наведения
              />
              <Legend />
              <ReferenceLine y={0} stroke="#000" />
              
              <Bar 
                dataKey="amplitude" 
                name="Амплитуда"
                fill={color}
                isAnimationActive={false}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getBarColor(entry, index)} />
                ))}
                
                {/* Добавляем метки для значимых гармоник */}
                <LabelList 
                  dataKey="amplitude" 
                  position="top" 
                  formatter={(value: number) => value > maxYValue * 0.1 ? value.toFixed(1) : ''}
                  style={{ fontSize: '10px' }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full w-full bg-gray-100 rounded-lg border">
            <p className="text-gray-500">Нет данных для отображения спектра</p>
          </div>
        )}
      </div>
      
      {/* Добавляем легенду для объяснения спектрального анализа */}
      <div className="mt-2 text-sm text-gray-600">
        <p>Высота столбца показывает вклад каждой гармоники в общую форму волны.</p>
        <p>Чем выше столбец, тем большее влияние имеет гармоника на звучание.</p>
      </div>
    </div>
  );
};

export default React.memo(SpectrumChart);