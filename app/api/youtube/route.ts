import { NextRequest, NextResponse } from 'next/server'
import { YoutubeTranscript } from 'youtube-transcript'

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

// 유튜브 자막 가져오기
async function getSubtitles(videoId: string): Promise<TranscriptSegment[]> {
  // 한국어 시도
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'ko' })
    return transcript.map(t => ({
      text: t.text,
      offset: t.offset,
      duration: t.duration,
    }))
  } catch {
    // 다른 언어 시도
  }

  // 영어 시도
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' })
    return transcript.map(t => ({
      text: t.text,
      offset: t.offset,
      duration: t.duration,
    }))
  } catch {
    // 다른 언어 시도
  }

  // 아무 언어나 시도
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId)
    return transcript.map(t => ({
      text: t.text,
      offset: t.offset,
      duration: t.duration,
    }))
  } catch {
    throw new Error('이 영상에는 자막이 없습니다. "파일 업로드" 탭에서 MP3 파일을 업로드해주세요.')
  }
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

    // 자막 가져오기
    let transcript: TranscriptSegment[]
    try {
      transcript = await getSubtitles(videoId)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '자막을 가져올 수 없습니다'
      return NextResponse.json(
        { error: errorMessage },
        { status: 404 }
      )
    }

    const fullText = transcript.map(t => t.text).join(' ')

    return NextResponse.json({
      videoInfo,
      transcript,
      fullText,
    })

  } catch (error) {
    console.error('YouTube API Error:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다' },
      { status: 500 }
    )
  }
}
