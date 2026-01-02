import { NextRequest, NextResponse } from 'next/server'
import { YoutubeTranscript } from 'youtube-transcript'
import { createClient } from '@supabase/supabase-js'

// Supabase 클라이언트 (환경변수가 있을 때만 초기화)
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    )
  : null

interface VideoInfo {
  videoId: string
  title: string
  channelName: string
  thumbnail: string
}

async function getVideoInfo(videoId: string): Promise<VideoInfo> {
  // oEmbed API로 기본 정보 가져오기 (API 키 불필요)
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

export async function POST(request: NextRequest) {
  try {
    const { videoId } = await request.json()

    if (!videoId || typeof videoId !== 'string') {
      return NextResponse.json(
        { error: '유효한 비디오 ID가 필요합니다' },
        { status: 400 }
      )
    }

    // 비디오 ID 형식 검증
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

    // 자막 추출
    let transcript
    try {
      transcript = await YoutubeTranscript.fetchTranscript(videoId, {
        lang: 'ko',
      })
    } catch {
      // 한국어 자막이 없으면 다른 언어 시도
      try {
        transcript = await YoutubeTranscript.fetchTranscript(videoId)
      } catch {
        return NextResponse.json(
          { error: '이 영상에는 자막이 없거나 자막을 가져올 수 없습니다' },
          { status: 404 }
        )
      }
    }

    // 전체 텍스트 생성
    const fullText = transcript.map(t => t.text).join(' ')

    // Supabase에 기록 저장 (설정된 경우)
    if (supabase) {
      try {
        await supabase.from('crawl_history').insert({
          video_id: videoId,
          title: videoInfo.title,
          channel_name: videoInfo.channelName,
          thumbnail: videoInfo.thumbnail,
          transcript_length: transcript.length,
        })
      } catch {
        // 저장 실패는 무시 (기록은 선택적 기능)
        console.error('Failed to save to Supabase')
      }
    }

    return NextResponse.json({
      videoInfo,
      transcript: transcript.map(t => ({
        text: t.text,
        offset: t.offset,
        duration: t.duration,
      })),
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

