import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = process.env.OPENAI_API_KEY 
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null

interface TranscriptSegment {
  text: string
  offset: number
  duration: number
}

export async function POST(request: NextRequest) {
  try {
    if (!openai) {
      return NextResponse.json(
        { error: 'OpenAI API 키가 설정되지 않았습니다' },
        { status: 500 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json(
        { error: '파일이 없습니다' },
        { status: 400 }
      )
    }

    // 파일 크기 체크 (25MB)
    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json(
        { error: '파일 크기는 25MB 이하여야 합니다' },
        { status: 400 }
      )
    }

    // 파일 타입 체크
    const validTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/m4a', 'audio/mp4', 'audio/x-m4a']
    const isValidType = validTypes.some(type => file.type.includes(type)) || 
                        file.name.endsWith('.mp3') || 
                        file.name.endsWith('.m4a') || 
                        file.name.endsWith('.wav')
    
    if (!isValidType) {
      return NextResponse.json(
        { error: '지원하지 않는 파일 형식입니다. MP3, M4A, WAV 파일을 업로드해주세요.' },
        { status: 400 }
      )
    }

    // Whisper API 호출
    const transcription = await openai.audio.transcriptions.create({
      file: file,
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
      segments.push({
        text: transcription.text,
        offset: 0,
        duration: 0,
      })
    }

    const fullText = segments.map(s => s.text).join(' ')

    return NextResponse.json({
      transcript: segments,
      fullText,
    })

  } catch (error) {
    console.error('Transcribe Error:', error)
    const errorMessage = error instanceof Error ? error.message : '음성 인식에 실패했습니다'
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

export const maxDuration = 60

