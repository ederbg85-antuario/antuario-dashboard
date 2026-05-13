'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function Home() {

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    checkOrg()
  }, [])

  const checkOrg = async () => {

    const { data } = await supabase.auth.getUser()
    const user = data.user

    if (!user) {
      router.push('/login')
      return
    }

    const { data: membership } = await supabase
      .from('memberships')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!membership) {
      router.push('/crear-organizacion')
    } else {
      router.push('/dashboard')
    }

  }

  return (
    <div style={{padding:40}}>
      <h1>Cargando Antuario...</h1>
    </div>
  )
}
