import Link from 'next/link';

export default function Home() {
  return (
    <main className="container mx-auto p-6">
      <h2 className="text-2xl font-bold mb-6">Выберите тип анализа</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link 
          href="/analyzers/wave" 
          className="p-6 bg-white border rounded-lg shadow-md hover:shadow-lg transition-shadow"
        >
          <h3 className="text-xl font-semibold mb-2 ">Анализатор звуковых волн</h3>
          <p className="text-gray-600">
            Исследуйте различные типы звуковых волн, их спектральный состав и 
            разложение в ряд Фурье. Визуализируйте процесс реконструкции сигнала
            с различным количеством гармоник.
          </p>
        </Link>
        
        <Link 
          href="/analyzers/music" 
          className="p-6 bg-white border rounded-lg shadow-md hover:shadow-lg transition-shadow"
        >
          <h3 className="text-xl font-semibold mb-2">Анализатор музыкальных нот</h3>
          <p className="text-gray-600">
            Изучайте спектральный состав музыкальных нот и аккордов. Определяйте 
            частоты нот и наблюдайте, как форма волны влияет на тембр звучания.
          </p>
        </Link>
      </div>
    </main>
  );
}