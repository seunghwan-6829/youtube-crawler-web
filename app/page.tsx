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
  videoInfo?: VideoInfo
  transcript: TranscriptSegment[]
  fullText: string
  fileName?: string
}

export default function Home() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<CrawlResult | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [mode, setMode] = useState<'url' | 'upload'>('url')
  const [dragOver, setDragOver] = useState(false)

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

  const handleUrlSubmit = async (e: React.FormEvent) => {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = async (file: File) => {
    if (!file.type.includes('audio') && !file.name.endsWith('.mp3') && !file.name.endsWith('.m4a') && !file.name.endsWith('.wav')) {
      setError('오디오 파일만 업로드 가능합니다 (MP3, M4A, WAV)')
      return
    }

    // 25MB 제한
    if (file.size > 25 * 1024 * 1024) {
      setError('파일 크기는 25MB 이하여야 합니다')
      return
    }

    setLoading(true)
    setError('')
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '알 수 없는 오류가 발생했습니다')
      }

      setResult({ ...data, fileName: file.name })
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileUpload(file)
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFileUpload(file)
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

  const openMp3Download = () => {
    const videoId = extractVideoId(url)
    if (videoId) {
      window.open(`https://ytmp3.cc/ko/youtube-to-mp3/?url=https://www.youtube.com/watch?v=${videoId}`, '_blank')
    } else {
      window.open('https://ytmp3.cc/ko/', '_blank')
    }
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
            유튜브 영상의 대본을 추출해드려요
          </p>
        </header>

        {/* 모드 선택 탭 */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex bg-surface-900/80 rounded-xl p-1 border border-surface-800">
            <button
              onClick={() => setMode('url')}
              className={`px-6 py-2.5 rounded-lg font-medium transition-all ${
                mode === 'url' 
                  ? 'bg-accent text-white glow-red' 
                  : 'text-surface-200 hover:text-white'
              }`}
            >
              🔗 URL 입력
            </button>
            <button
              onClick={() => setMode('upload')}
              className={`px-6 py-2.5 rounded-lg font-medium transition-all ${
                mode === 'upload' 
                  ? 'bg-accent text-white glow-red' 
                  : 'text-surface-200 hover:text-white'
              }`}
            >
              📁 파일 업로드
            </button>
          </div>
        </div>

        {/* URL 입력 모드 */}
        {mode === 'url' && (
          <div className="animate-slide-up">
            <form onSubmit={handleUrlSubmit} className="mb-4">
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
            <p className="text-center text-surface-200/60 text-sm">
              ✨ 자막 있는 영상은 바로 추출! 자막 없으면 AI가 음성 인식해요 (최대 10분)
            </p>
          </div>
        )}

        {/* 파일 업로드 모드 */}
        {mode === 'upload' && (
          <div className="animate-slide-up space-y-4">
            {/* MP3 다운로드 안내 */}
            <div className="bg-surface-900/80 border border-surface-800 rounded-2xl p-6">
              <h3 className="font-bold mb-3 flex items-center gap-2">
                <span className="text-xl">📥</span> 
                먼저 MP3 파일을 다운받으세요
              </h3>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="유튜브 URL 붙여넣기 (선택)"
                  className="flex-1 px-4 py-3 bg-surface-800 border border-surface-800 rounded-xl text-white placeholder-surface-200/50 focus:outline-none focus:border-accent/50 font-mono text-sm"
                />
                <button
                  onClick={openMp3Download}
                  className="px-6 py-3 bg-green-600 hover:bg-green-500 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  MP3 다운로드 사이트
                </button>
              </div>
              <p className="text-surface-200/60 text-sm mt-3">
                → 외부 사이트에서 MP3 파일을 다운받은 후, 아래에 업로드하세요
              </p>
            </div>

            {/* 파일 업로드 영역 */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all ${
                dragOver 
                  ? 'border-accent bg-accent/10' 
                  : 'border-surface-800 hover:border-surface-200/30'
              }`}
            >
              <input
                type="file"
                accept="audio/*,.mp3,.m4a,.wav"
                onChange={handleFileInput}
                className="hidden"
                id="file-upload"
                disabled={loading}
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 bg-surface-800 rounded-2xl flex items-center justify-center">
                    <svg className="w-8 h-8 text-surface-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-lg font-medium mb-1">
                      {loading ? '분석 중...' : '파일을 드래그하거나 클릭해서 업로드'}
                    </p>
                    <p className="text-surface-200/60 text-sm">
                      MP3, M4A, WAV 지원 (최대 25MB)
                    </p>
                  </div>
                </div>
              </label>
            </div>
          </div>
        )}

        {/* 에러 메시지 */}
        {error && (
          <div className="mt-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 animate-fade-in">
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
          <div className="mt-6 space-y-4 animate-fade-in">
            <div className="h-32 rounded-2xl shimmer" />
            <div className="h-64 rounded-2xl shimmer" />
          </div>
        )}

        {/* 결과 */}
        {result && !loading && (
          <div className="mt-6 space-y-6 animate-slide-up">
            {/* 영상/파일 정보 카드 */}
            <div className="bg-surface-900/80 backdrop-blur-sm border border-surface-800 rounded-2xl overflow-hidden card-hover">
              <div className="flex flex-col md:flex-row">
                {result.videoInfo ? (
                  <>
                    <div className="relative w-full md:w-72 aspect-video md:aspect-auto flex-shrink-0">
                      <Image
                        src={result.videoInfo.thumbnail}
                        alt={result.videoInfo.title}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div className="p-6 flex flex-col justify-center">
                      <h2 className="text-xl font-bold mb-2 line-clamp-2">
                        {result.videoInfo.title}
                      </h2>
                      <p className="text-surface-200">
                        {result.videoInfo.channelName}
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="p-6 flex items-center gap-4">
                    <div className="w-16 h-16 bg-accent/20 rounded-xl flex items-center justify-center">
                      <svg className="w-8 h-8 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-xl font-bold mb-1">{result.fileName}</h2>
                      <p className="text-surface-200">업로드된 오디오 파일</p>
                    </div>
                  </div>
                )}
                <div className="p-6 flex items-center">
                  <span className="px-3 py-1 bg-accent/10 text-accent rounded-full text-sm font-medium">
                    {result.transcript.length}개 세그먼트
                  </span>
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
                    {result.videoInfo ? (
                      <a
                        href={`https://youtube.com/watch?v=${result.videoInfo.videoId}&t=${Math.floor(segment.offset)}s`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="timestamp flex-shrink-0 hover:bg-accent/30 transition-colors"
                      >
                        {formatTime(segment.offset)}
                      </a>
                    ) : (
                      <span className="timestamp flex-shrink-0">
                        {formatTime(segment.offset)}
                      </span>
                    )}
                    <p className="text-surface-100 leading-relaxed">
                      {segment.text}
                    </p>
                  </div>
                ))}
              </div>
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
