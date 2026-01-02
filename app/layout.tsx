import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'YouTube Transcript Extractor',
  description: '유튜브 영상의 대본을 손쉽게 추출하세요',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body className="font-sans text-white antialiased">
        {children}
      </body>
    </html>
  )
}

