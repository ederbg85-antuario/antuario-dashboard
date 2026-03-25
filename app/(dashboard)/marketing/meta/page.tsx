// ============================================================
// app/(dashboard)/marketing/meta/page.tsx
// ============================================================
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import MetaAdsClient from '@/components/marketing/MetaAdsClient'
import { getDateFilterFromCookie } from '@/lib/date-filter'
