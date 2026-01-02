'use client'

import { useState } from 'react'
import Image from 'next/image'

interface TranscriptSegment {
  text: string
  offset: number
  duration: number
}

interface VideoInfo {
  videoId: string
  title: string
  channelName: string
  thumbnail: string
}

interface CrawlResult {
  videoInfo: VideoInfo
  transcript: TranscriptSegment[]
  fullText: string
}

interface HistoryItem {
  id: string
  video_id: string
  title: string
  thumbnail: string
  created_at: string
}

export default function Home() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<CrawlResult | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [showHistory, setShowHistory] = useState(false)

  const extractVideoId = (inputUrl: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    ]
    for (const pattern of patterns) {
      const match = inputUrl.match(pattern)
      if (match) return match[1]
    }
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const videoId = extractVideoId(url)
    if (!videoId) {
      setError('올바른 유튜브 URL을 입력해주세요')
      return
    }

    setLoading(true)
    setError('')
    setResult(null)

    try {
      const response = await fetch('/api/youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '알 수 없는 오류가 발생했습니다')
      }

      setResult(data)
      
      // 히스토리 새로고침
      fetchHistory()
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  const fetchHistory = async () => {
    try {
      const response = await fetch('/api/history')
      if (response.ok) {
        const data = await response.json()
        setHistory(data.history || [])
      }
    } catch {
      // 히스토리 로드 실패는 무시
    }
  }

  const copyToClipboard = async () => {
    if (!result?.fullText) return
    
    try {
      await navigator.clipboard.writeText(result.fullText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('클립보드 복사에 실패했습니다')
    }
  }

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <main className="min-h-screen px-4 py-12 md:py-20">
      {/* 배경 장식 */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-32 w-64 h-64 bg-accent/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-4xl mx-auto">
        {/* 헤더 */}
        <header className="text-center mb-12 animate-fade-in">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-accent rounded-xl flex items-center justify-center glow-red">
              <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/>
              </svg>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-gradient">
              Transcript Extractor
            </h1>
          </div>
          <p className="text-surface-200 text-lg">
            유튜브 영상 링크를 입력하면 대본을 자동으로 추출해드려요
          </p>
        </header>

        {/* 입력 폼 */}
        <form onSubmit={handleSubmit} className="mb-8 animate-slide-up">
          <div className="relative">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
              className="w-full px-6 py-4 bg-surface-900/80 backdrop-blur-sm border border-surface-800 rounded-2xl text-white placeholder-surface-200/50 input-focus focus:border-accent/50 focus:outline-none font-mono text-sm md:text-base"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !url.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-6 py-2.5 bg-accent hover:bg-accent-light disabled:bg-surface-800 disabled:text-surface-200/50 rounded-xl font-medium transition-all duration-200 disabled:cursor-not-allowed glow-red hover:glow-red-intense"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  추출 중
                </span>
              ) : '추출하기'}
            </button>
          </div>
        </form>

        {/* 에러 메시지 */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 animate-fade-in">
            <span className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </span>
          </div>
        )}

        {/* 로딩 상태 */}
        {loading && (
          <div className="space-y-4 animate-fade-in">
            <div className="h-32 rounded-2xl shimmer" />
            <div className="h-64 rounded-2xl shimmer" />
          </div>
        )}

        {/* 결과 */}
        {result && !loading && (
          <div className="space-y-6 animate-slide-up">
            {/* 영상 정보 카드 */}
            <div className="bg-surface-900/80 backdrop-blur-sm border border-surface-800 rounded-2xl overflow-hidden card-hover">
              <div className="flex flex-col md:flex-row">
                <div className="relative w-full md:w-72 aspect-video md:aspect-auto flex-shrink-0">
                  <Image
                    src={result.videoInfo.thumbnail}
                    alt={result.videoInfo.title}
                    fill
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent to-surface-900/50 hidden md:block" />
                </div>
                <div className="p-6 flex flex-col justify-center">
                  <h2 className="text-xl font-bold mb-2 line-clamp-2">
                    {result.videoInfo.title}
                  </h2>
                  <p className="text-surface-200">
                    {result.videoInfo.channelName}
                  </p>
                  <div className="mt-4 flex items-center gap-3">
                    <span className="px-3 py-1 bg-accent/10 text-accent rounded-full text-sm font-medium">
                      {result.transcript.length}개 세그먼트
                    </span>
                    <span className="text-surface-200/60 text-sm">
                      약 {Math.ceil(result.fullText.length / 500)}분 분량
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 대본 카드 */}
            <div className="bg-surface-900/80 backdrop-blur-sm border border-surface-800 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-surface-800">
                <h3 className="font-bold flex items-center gap-2">
                  <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  전체 대본
                </h3>
                <button
                  onClick={copyToClipboard}
                  className="px-4 py-2 bg-surface-800 hover:bg-surface-200/20 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  {copied ? (
                    <>
                      <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      복사됨!
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      복사하기
                    </>
                  )}
                </button>
              </div>
              
              {/* 타임스탬프 뷰 */}
              <div className="max-h-[500px] overflow-y-auto p-4 space-y-2">
                {result.transcript.map((segment, index) => (
                  <div 
                    key={index}
                    className="flex gap-3 p-2 rounded-lg hover:bg-surface-800/50 transition-colors group"
                  >
                    <a
                      href={`https://youtube.com/watch?v=${result.videoInfo.videoId}&t=${Math.floor(segment.offset)}s`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="timestamp flex-shrink-0 hover:bg-accent/30 transition-colors"
                    >
                      {formatTime(segment.offset)}
                    </a>
                    <p className="text-surface-100 leading-relaxed">
                      {segment.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 히스토리 버튼 */}
        <div className="fixed bottom-6 right-6">
          <button
            onClick={() => {
              setShowHistory(!showHistory)
              if (!showHistory) fetchHistory()
            }}
            className="w-14 h-14 bg-surface-900 border border-surface-800 rounded-full flex items-center justify-center hover:border-accent/50 transition-colors card-hover"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>

        {/* 히스토리 패널 */}
        {showHistory && (
          <div className="fixed bottom-24 right-6 w-80 bg-surface-900/95 backdrop-blur-sm border border-surface-800 rounded-2xl overflow-hidden animate-slide-up shadow-2xl">
            <div className="p-4 border-b border-surface-800">
              <h3 className="font-bold">최근 추출 기록</h3>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {history.length === 0 ? (
                <div className="p-6 text-center text-surface-200/60">
                  아직 기록이 없어요
                </div>
              ) : (
                history.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setUrl(`https://youtube.com/watch?v=${item.video_id}`)
                      setShowHistory(false)
                    }}
                    className="w-full p-3 flex items-center gap-3 hover:bg-surface-800/50 transition-colors text-left"
                  >
                    <img
                      src={item.thumbnail}
                      alt=""
                      className="w-16 h-10 object-cover rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      <p className="text-xs text-surface-200/60">
                        {new Date(item.created_at).toLocaleDateString('ko-KR')}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* 푸터 */}
        <footer className="mt-16 text-center text-surface-200/40 text-sm">
          <p>YouTube Transcript Extractor • 대본 추출기</p>
        </footer>
      </div>
    </main>
  )
}

