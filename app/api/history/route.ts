import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  // Supabase가 설정되지 않은 경우
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return NextResponse.json({ history: [] })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  )

  try {
    const { data, error } = await supabase
      .from('crawl_history')
      .select('id, video_id, title, thumbnail, created_at')
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      throw error
    }

    return NextResponse.json({ history: data || [] })
  } catch (error) {
    console.error('History fetch error:', error)
    return NextResponse.json({ history: [] })
  }
}

