// import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

// export const metadata: Metadata = {
//   title: 'Анализатор звуковых волн',
//   description: 'Интерактивный программный комплекс для анализа звуковых волн с использованием рядов Фурье',
// };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="bg-blue-600 text-white py-4">
          <div className="container mx-auto px-4" key="header">
            <h1 className="text-3xl font-bold">Анализатор звуковых волн</h1>
            <p className="mt-2">Интерактивный программный комплекс для изучения гармонического состава звуков</p>
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}