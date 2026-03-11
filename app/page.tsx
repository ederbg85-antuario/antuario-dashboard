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

    const { data: org } = await supabase
      .from('organizations')
      .select('*')
      .eq('created_by', user.id)
      .single()

    if (!org) {
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
