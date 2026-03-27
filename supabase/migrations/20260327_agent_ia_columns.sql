-- Migration: Add AI Agent columns for contact profiling and company descriptions
-- Date: 2026-03-27

-- 1. AI-generated profile summary for contacts
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS ai_profile TEXT;

-- 2. Decision level of the contact (e.g., 'decision_maker', 'influencer', 'user')
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS decision_level TEXT;

-- 3. AI-generated description for companies
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS description TEXT;

-- 4. Error tracking for marketing connections
ALTER TABLE public.marketing_connections ADD COLUMN IF NOT EXISTS last_error TEXT;
