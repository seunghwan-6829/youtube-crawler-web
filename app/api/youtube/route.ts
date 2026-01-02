import { NextRequest, NextResponse } from 'next/server'
import { YoutubeTranscript } from 'youtube-transcript'
import OpenAI from 'openai'

// OpenAI 클라이언트
const openai = process.env.OPENAI_API_KEY 
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null

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

// Whisper API로 음성 인식
async function transcribeWithWhisper(videoId: string): Promise<TranscriptSegment[]> {
  if (!openai) {
    throw new Error('OpenAI API 키가 설정되지 않았습니다')
  }

  // 유튜브 오디오 다운로드 서비스 사용
  const audioUrl = `https://yt-download.org/api/button/mp3/${videoId}`
  
  // 대안: cobalt.tools API 사용
  const cobaltResponse = await fetch('https://api.cobalt.tools/api/json', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      url: `https://www.youtube.com/watch?v=${videoId}`,
      vCodec: 'h264',
      vQuality: '720',
      aFormat: 'mp3',
      isAudioOnly: true,
    }),
  })

  if (!cobaltResponse.ok) {
    // Cobalt 실패 시 직접 다운로드 시도
    throw new Error('오디오 추출에 실패했습니다. 잠시 후 다시 시도해주세요.')
  }

  const cobaltData = await cobaltResponse.json()
  
  if (cobaltData.status !== 'stream' && cobaltData.status !== 'redirect') {
    throw new Error('오디오 URL을 가져올 수 없습니다')
  }

  const finalAudioUrl = cobaltData.url

  // 오디오 다운로드
  const audioResponse = await fetch(finalAudioUrl)
  if (!audioResponse.ok) {
    throw new Error('오디오 다운로드에 실패했습니다')
  }

  const audioBuffer = await audioResponse.arrayBuffer()
  const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' })
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
  const segments: TranscriptSegment[] = (transcription.segments || []).map((seg: { text: string; start: number; end: number }) => ({
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
      if (!openai) {
        return NextResponse.json(
          { error: '이 영상에는 자막이 없습니다. AI 음성 인식을 위해 OpenAI API 키가 필요합니다.' },
          { status: 400 }
        )
      }

      try {
        transcript = await transcribeWithWhisper(videoId)
        usedWhisper = true
      } catch (error) {
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

export const maxDuration = 60 // Vercel Pro: 최대 60초
