import { NextRequest, NextResponse } from 'next/server'
import { YoutubeTranscript } from 'youtube-transcript'
import OpenAI from 'openai'

// OpenAI 클라이언트
const openai = process.env.OPENAI_API_KEY 
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null

// RapidAPI 설정
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY
const RAPIDAPI_HOST = 'youtube-mp36.p.rapidapi.com'

interface VideoInfo {
  videoId: string
  title: string
  channelName: string
  thumbnail: string
}

interface TranscriptSegment {
  text: string
  offset: number
  duration: number
}

async function getVideoInfo(videoId: string): Promise<VideoInfo> {
  const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
  
  const response = await fetch(oembedUrl)
  
  if (!response.ok) {
    throw new Error('영상 정보를 가져올 수 없습니다')
  }
  
  const data = await response.json()
  
  return {
    videoId,
    title: data.title,
    channelName: data.author_name,
    thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
  }
}

// 유튜브 자막 먼저 시도
async function tryGetSubtitles(videoId: string): Promise<TranscriptSegment[] | null> {
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'ko' })
    return transcript.map(t => ({
      text: t.text,
      offset: t.offset,
      duration: t.duration,
    }))
  } catch {
    try {
      const transcript = await YoutubeTranscript.fetchTranscript(videoId)
      return transcript.map(t => ({
        text: t.text,
        offset: t.offset,
        duration: t.duration,
      }))
    } catch {
      return null
    }
  }
}

// RapidAPI로 오디오 URL 가져오기 (재시도 로직 포함)
async function getAudioUrl(videoId: string): Promise<string> {
  if (!RAPIDAPI_KEY) {
    throw new Error('RapidAPI 키가 설정되지 않았습니다')
  }

  const maxRetries = 5
  const retryDelay = 3000 // 3초

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(`https://${RAPIDAPI_HOST}/dl?id=${videoId}`, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
      },
    })

    if (!response.ok) {
      throw new Error('오디오 URL을 가져올 수 없습니다')
    }

    const data = await response.json()
    
    // 변환 완료
    if (data.status === 'ok' && data.link) {
      return data.link
    }
    
    // 처리 중이면 대기 후 재시도
    if (data.status === 'processing' || data.msg === 'in process') {
      console.log(`오디오 변환 중... (${attempt + 1}/${maxRetries})`)
      await new Promise(resolve => setTimeout(resolve, retryDelay))
      continue
    }
    
    // 그 외 오류
    throw new Error(data.msg || '오디오 변환에 실패했습니다')
  }

  throw new Error('오디오 변환 시간이 초과되었습니다. 다시 시도해주세요.')
}

// Whisper API로 음성 인식
async function transcribeWithWhisper(videoId: string): Promise<TranscriptSegment[]> {
  if (!openai) {
    throw new Error('OpenAI API 키가 설정되지 않았습니다')
  }

  // RapidAPI로 오디오 URL 가져오기
  const audioUrl = await getAudioUrl(videoId)
  
  // 오디오 다운로드
  const audioResponse = await fetch(audioUrl)
  if (!audioResponse.ok) {
    throw new Error('오디오 다운로드에 실패했습니다')
  }

  const arrayBuffer = await audioResponse.arrayBuffer()
  
  // 파일 크기 체크 (Whisper API 제한: 25MB)
  const maxSize = 25 * 1024 * 1024
  if (arrayBuffer.byteLength > maxSize) {
    throw new Error('영상이 너무 깁니다. 10분 이하의 영상으로 시도해주세요.')
  }

  // Buffer를 File 객체로 변환
  const uint8Array = new Uint8Array(arrayBuffer)
  const audioBlob = new Blob([uint8Array], { type: 'audio/mpeg' })
  const audioFile = new File([audioBlob], 'audio.mp3', { type: 'audio/mpeg' })

  // Whisper API 호출
  const transcription = await openai.audio.transcriptions.create({
    file: audioFile,
    model: 'whisper-1',
    language: 'ko',
    response_format: 'verbose_json',
    timestamp_granularities: ['segment'],
  })

  // 세그먼트 변환
  interface WhisperSegment {
    text: string
    start: number
    end: number
  }
  
  const segments: TranscriptSegment[] = ((transcription as { segments?: WhisperSegment[] }).segments || []).map((seg: WhisperSegment) => ({
    text: seg.text.trim(),
    offset: seg.start,
    duration: seg.end - seg.start,
  }))

  // 세그먼트가 없으면 전체 텍스트를 하나의 세그먼트로
  if (segments.length === 0 && transcription.text) {
    return [{
      text: transcription.text,
      offset: 0,
      duration: 0,
    }]
  }

  return segments
}

export async function POST(request: NextRequest) {
  try {
    const { videoId } = await request.json()

    if (!videoId || typeof videoId !== 'string') {
      return NextResponse.json(
        { error: '유효한 비디오 ID가 필요합니다' },
        { status: 400 }
      )
    }

    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return NextResponse.json(
        { error: '올바른 YouTube 비디오 ID 형식이 아닙니다' },
        { status: 400 }
      )
    }

    // 영상 정보 가져오기
    let videoInfo: VideoInfo
    try {
      videoInfo = await getVideoInfo(videoId)
    } catch {
      return NextResponse.json(
        { error: '영상을 찾을 수 없습니다. URL을 확인해주세요.' },
        { status: 404 }
      )
    }

    let transcript: TranscriptSegment[]
    let usedWhisper = false

    // 1. 먼저 유튜브 자막 시도
    const subtitles = await tryGetSubtitles(videoId)
    
    if (subtitles && subtitles.length > 0) {
      transcript = subtitles
    } else {
      // 2. 자막 없으면 Whisper AI로 음성 인식
      if (!openai || !RAPIDAPI_KEY) {
        return NextResponse.json(
          { error: '이 영상에는 자막이 없습니다. AI 음성 인식을 사용하려면 API 키 설정이 필요합니다.' },
          { status: 400 }
        )
      }

      try {
        transcript = await transcribeWithWhisper(videoId)
        usedWhisper = true
      } catch (error) {
        console.error('Whisper Error:', error)
        const errorMessage = error instanceof Error ? error.message : '음성 인식에 실패했습니다'
        return NextResponse.json(
          { error: errorMessage },
          { status: 500 }
        )
      }
    }

    const fullText = transcript.map(t => t.text).join(' ')

    return NextResponse.json({
      videoInfo,
      transcript,
      fullText,
      usedWhisper,
    })

  } catch (error) {
    console.error('YouTube API Error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다' },
      { status: 500 }
    )
  }
}

export const maxDuration = 60
