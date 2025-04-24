import FourierTuner from '@/components/FourierTuner';
import Link from 'next/link';

export default function TunerPage() {
  return (
    <div className="container mx-auto p-4">
      <div className="bg-[var(--card-bg)] p-4 rounded-lg shadow border border-[var(--card-border)] mb-4"> 
        <Link href="/" className="text-blue-500 hover:text-blue-700">
          ← Вернуться на главную
        </Link>
      </div>
      
      {/* Используем новый компонент Фурье-тюнера */}
      <FourierTuner />
    </div>
  );
}