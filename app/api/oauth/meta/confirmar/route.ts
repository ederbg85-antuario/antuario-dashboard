import {NextRequest} from 'next/server'
import {confirmIntegration,cancelIntegration} from '@/lib/confirm-integration'
export const POST=(req:NextRequest)=>confirmIntegration(req,'meta')
export const DELETE=cancelIntegration
