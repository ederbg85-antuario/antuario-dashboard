'use client'

import React, { useEffect, useState } from 'react'

const ISOTIPO = 'https://static.wixstatic.com/shapes/cff7e6_c020ed64c5e34bbd8c2f66300ee769dc.svg'
const LOGO = 'https://static.wixstatic.com/shapes/cff7e6_ceb7df677949454eb0aa2d5641d9ca75.svg'

export default function AuthShell({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<'splash' | 'exit' | 'form'>('splash')

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('exit'), 4200)
    const t2 = setTimeout(() => setPhase('form'), 4900)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Nunito:wght@800;900&family=Playfair+Display:ital,wght@1,900&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        /* ─── Root ── base oscura-media para que los blobs resalten ─ */
        .auth-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Inter', system-ui, sans-serif;
          padding: 24px;
          position: relative;
          overflow: hidden;
          /* Base un poco más clara */
          background: linear-gradient(145deg, #243d62 0%, #274468 50%, #1e3656 100%);
        }

        /* ─── Blobs — paleta neutra: teal, azul, índigo, cian, verde, ámbar ── */
        .blob { position: absolute; border-radius: 50%; pointer-events: none; will-change: transform; }

        /* 1 — Teal/agua — top-left, dominante */
        .blob-1 {
          width: 900px; height: 900px;
          background: radial-gradient(circle at 38% 38%,
            rgba(6,182,212,0.80)   0%,
            rgba(14,165,190,0.55)  34%,
            transparent            62%);
          filter: blur(60px);
          top: -280px; left: -240px;
          animation: b1 10s ease-in-out infinite;
        }
        /* 2 — Azul eléctrico — top-right */
        .blob-2 {
          width: 800px; height: 800px;
          background: radial-gradient(circle at 55% 44%,
            rgba(59,130,246,0.78)  0%,
            rgba(37,99,235,0.52)   36%,
            transparent            62%);
          filter: blur(60px);
          top: -220px; right: -200px;
          animation: b2 13s ease-in-out infinite;
        }
        /* 3 — Naranja vibrante — center-left */
        .blob-3 {
          width: 640px; height: 640px;
          background: radial-gradient(circle at 50% 50%,
            rgba(249,115,22,0.70)  0%,
            rgba(234,88,12,0.44)   40%,
            transparent            66%);
          filter: blur(65px);
          top: 20%; left: -100px;
          animation: b3 13s ease-in-out infinite;
        }
        /* 4 — Magenta/rosa fuerte — top-center */
        .blob-4 {
          width: 560px; height: 560px;
          background: radial-gradient(circle at 50% 50%,
            rgba(217,70,239,0.68)  0%,
            rgba(168,40,200,0.42)  44%,
            transparent            66%);
          filter: blur(62px);
          top: -100px; left: 35%;
          animation: b4 10s ease-in-out infinite;
        }
        /* 5 — Verde esmeralda — bottom-right */
        .blob-5 {
          width: 560px; height: 560px;
          background: radial-gradient(circle at 50% 50%,
            rgba(16,185,129,0.72)  0%,
            rgba(5,150,105,0.46)   46%,
            transparent            68%);
          filter: blur(60px);
          bottom: -150px; right: -90px;
          animation: b5 11s ease-in-out infinite;
        }
        /* 6 — Índigo profundo — center */
        .blob-6 {
          width: 580px; height: 580px;
          background: radial-gradient(circle at 50% 50%,
            rgba(99,60,220,0.62)   0%,
            rgba(67,36,180,0.38)   44%,
            transparent            68%);
          filter: blur(72px);
          top: 45%; left: 48%;
          transform: translate(-50%,-50%);
          animation: b6 17s ease-in-out infinite;
        }
        /* 7 — Ámbar/dorado — bottom-left */
        .blob-7 {
          width: 420px; height: 420px;
          background: radial-gradient(circle at 50% 50%,
            rgba(251,191,36,0.52)  0%,
            rgba(245,158,11,0.30)  48%,
            transparent            70%);
          filter: blur(65px);
          bottom: -80px; left: 80px;
          animation: b7 14s ease-in-out infinite;
        }

        @keyframes b1 {
          0%,100% { transform: translate(0,0) scale(1); }
          28%     { transform: translate(150px,120px)  scale(1.12); }
          60%     { transform: translate(65px, 210px)  scale(0.90); }
          82%     { transform: translate(-65px,108px)  scale(1.06); }
        }
        @keyframes b2 {
          0%,100% { transform: translate(0,0) scale(1); }
          30%     { transform: translate(-165px,-135px) scale(1.14); }
          65%     { transform: translate(-78px,  76px)  scale(0.88); }
          85%     { transform: translate(-115px,-88px)  scale(1.06); }
        }
        @keyframes b3 {
          0%,100% { transform: translate(-50%,-50%) scale(1); }
          22%     { transform: translate(calc(-50%+185px),calc(-50%-118px)) scale(1.20); }
          55%     { transform: translate(calc(-50%-108px),calc(-50%+168px)) scale(0.85); }
          82%     { transform: translate(calc(-50%+78px),calc(-50%+62px))   scale(1.10); }
        }
        @keyframes b4 {
          0%,100% { transform: translate(0,0) scale(1); }
          42%     { transform: translate(155px,-155px) scale(1.18); }
          72%     { transform: translate(75px,-75px)   scale(0.88); }
        }
        @keyframes b5 {
          0%,100% { transform: translate(0,0) scale(1); }
          38%     { transform: translate(-145px,-138px) scale(1.16); }
          70%     { transform: translate(-68px,-65px)   scale(0.87); }
        }
        @keyframes b6 {
          0%,100% { transform: translate(0,0) scale(1); }
          45%     { transform: translate(110px,120px) scale(1.20); }
          80%     { transform: translate(-75px,55px)  scale(0.88); }
        }
        @keyframes b7 {
          0%,100% { transform: translate(0,0) scale(1); }
          50%     { transform: translate(-110px,-120px) scale(1.18); }
          80%     { transform: translate(-50px,-60px)   scale(0.90); }
        }

        /* ─── Splash ─────────────────────────────────────────────── */
        .splash {
          position: absolute; inset: 0;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          z-index: 20; pointer-events: none; gap: 0;
        }

        /* Isotipo — CSS mask + mismo shimmer gradient que "Hola" */
        .splash-iso-wrap {
          width: 82px; height: 82px;
          margin-bottom: 26px;
          opacity: 0;
          animation: isoIn 0.75s cubic-bezier(0.22,1,0.36,1) 0.15s forwards;
        }
        @keyframes isoIn {
          from { opacity: 0; transform: scale(0.5) rotate(-14deg); }
          to   { opacity: 1; transform: scale(1)   rotate(0deg);   }
        }
        .splash-iso-gradient {
          width: 82px; height: 82px;
          background: linear-gradient(
            118deg,
            #fff     0%,
            #a5f3fc 16%,
            #818cf8 32%,
            #38bdf8 50%,
            #34d399 66%,
            #fde68a 82%,
            #fff    100%
          );
          background-size: 220% auto;
          -webkit-mask-image: url('${ISOTIPO}');
                  mask-image: url('${ISOTIPO}');
          -webkit-mask-size: contain;
                  mask-size: contain;
          -webkit-mask-repeat: no-repeat;
                  mask-repeat: no-repeat;
          -webkit-mask-position: center;
                  mask-position: center;
          animation: shimmer 3s linear 1s infinite;
          filter: drop-shadow(0 0 22px rgba(100,200,255,0.55))
                  drop-shadow(0 0 44px rgba(80,160,240,0.30));
        }

        /* "hola" — Nunito rounded + shimmer */
        .splash-hola {
          font-family: 'Nunito', 'Varela Round', system-ui, sans-serif;
          font-style: normal;
          font-weight: 900;
          font-size: clamp(96px, 17vw, 176px);
          letter-spacing: -0.02em;
          line-height: 0.9;
          opacity: 0;
          background: linear-gradient(
            118deg,
            #fff     0%,
            #a5f3fc 16%,
            #818cf8 32%,
            #38bdf8 50%,
            #34d399 66%,
            #fde68a 82%,
            #fff    100%
          );
          background-size: 220% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation:
            holaIn  0.8s cubic-bezier(0.22,1,0.36,1) 0.55s forwards,
            shimmer 3s  linear                        1.2s  infinite;
          filter: drop-shadow(0 0 50px rgba(100,180,255,0.45))
                  drop-shadow(0 0 24px rgba(80,230,200,0.30));
        }
        @keyframes holaIn {
          from { opacity: 0; transform: translateY(32px) skewX(4deg) scale(0.9); }
          to   { opacity: 1; transform: translateY(0)    skewX(0deg) scale(1);   }
        }
        @keyframes shimmer {
          from { background-position: 0%   center; }
          to   { background-position: 220% center; }
        }

        .splash-tagline {
          font-size: 11.5px; color: rgba(255,255,255,0.45);
          font-weight: 500; letter-spacing: 0.26em;
          text-transform: uppercase; opacity: 0;
          margin-top: 24px;
          animation: fadeUp 0.6s ease 1.05s forwards;
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0);    }
        }

        .splash-exit {
          animation: splashOut 0.65s cubic-bezier(0.55,0,0.9,0.4) forwards !important;
        }
        @keyframes splashOut {
          0%   { opacity: 1; transform: scale(1);    }
          100% { opacity: 0; transform: scale(1.05); }
        }

        /* ─── Card — vidrio ahumado, un poco más oscuro, sombra suave ── */
        .auth-card {
          position: relative; z-index: 10;
          /* Ahumado: rgba negro al 32% — transparentoso pero oscurito */
          background: rgba(0, 10, 28, 0.32);
          backdrop-filter: blur(38px) saturate(160%);
          -webkit-backdrop-filter: blur(38px) saturate(160%);
          border-radius: 28px;
          padding: 48px 44px;
          width: 100%; max-width: 440px;
          border: 1px solid rgba(255,255,255,0.13);
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.05) inset,
            0 2px 0   rgba(255,255,255,0.08) inset,
            0 20px 50px rgba(0,0,0,0.22),
            0  8px 20px rgba(0,0,0,0.14);
          animation: cardIn 0.65s cubic-bezier(0.22,1,0.36,1) both;
        }
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(40px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }

        /* ─── Logo — blanco ──────────────────────────────────────── */
        .auth-logo {
          display: block; height: 30px; width: auto;
          margin: 0 auto 22px;
          filter: brightness(0) invert(1);
          opacity: 0.88;
        }

        /* ─── Tipografía — blanca sobre card oscuro ──────────────── */
        .auth-title {
          font-size: 26px; font-weight: 800; color: #fff;
          letter-spacing: -0.035em; margin: 0 0 6px;
          line-height: 1.15; text-align: center;
        }
        .auth-sub {
          font-size: 14px; color: rgba(255,255,255,0.46);
          margin: 0 0 28px; font-weight: 400; text-align: center;
        }

        /* ─── Inputs — glass neutro ──────────────────────────────── */
        .auth-label {
          display: block; font-size: 12.5px; font-weight: 600;
          color: rgba(255,255,255,0.62); margin-bottom: 7px; letter-spacing: 0.01em;
        }
        .auth-input {
          width: 100%; padding: 13px 16px; border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.13);
          font-size: 14px; font-family: 'Inter', system-ui, sans-serif;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
          color: #fff; background: rgba(255,255,255,0.07);
          box-shadow: inset 0 1px 3px rgba(0,0,0,0.2);
        }
        .auth-input::placeholder { color: rgba(255,255,255,0.26); }
        .auth-input:focus {
          border-color: rgba(99,202,220,0.65);
          box-shadow: 0 0 0 3px rgba(99,202,220,0.13), inset 0 1px 2px rgba(0,0,0,0.1);
          background: rgba(255,255,255,0.11);
        }

        /* ─── Botón negro mate ───────────────────────────────────── */
        .auth-btn {
          width: 100%; padding: 14px;
          background: #1c1c1e;
          color: #fff; border: none; border-radius: 14px;
          font-size: 15px; font-weight: 700;
          font-family: 'Inter', system-ui, sans-serif;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3),
                      0 1px 0 rgba(255,255,255,0.06) inset;
          transition: transform 0.15s, box-shadow 0.15s, background 0.15s, opacity 0.2s;
          letter-spacing: -0.01em;
        }
        .auth-btn:hover:not(:disabled) {
          background: #2c2c2e;
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(0,0,0,0.38);
        }
        .auth-btn:active:not(:disabled) { transform: translateY(0); background: #111; }
        .auth-btn:disabled { opacity: 0.34; cursor: not-allowed; }

        /* ─── Error ──────────────────────────────────────────────── */
        .auth-error {
          background: rgba(239,68,68,0.14); border: 1px solid rgba(239,68,68,0.28);
          border-radius: 12px; padding: 11px 15px;
          color: #fca5a5; font-size: 13px; font-weight: 500; margin-bottom: 18px;
        }

        .auth-field      { margin-bottom: 16px; }
        .auth-field-last { margin-bottom: 24px; }

        .auth-eye {
          position: absolute; right: 14px; bottom: 13px;
          background: none; border: none; cursor: pointer;
          color: rgba(255,255,255,0.32); padding: 0; line-height: 1; transition: color 0.15s;
        }
        .auth-eye:hover { color: rgba(255,255,255,0.72); }

        /* ─── Links ──────────────────────────────────────────────── */
        .auth-links {
          margin-top: 22px; text-align: center; font-size: 13.5px;
          color: rgba(255,255,255,0.4);
          display: flex; flex-direction: column; gap: 10px;
        }
        .auth-link {
          color: rgba(255,255,255,0.72); font-weight: 600;
          text-decoration: none; transition: color 0.15s;
        }
        .auth-link:hover { color: #fff; }
      `}</style>

      <div className="auth-root">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
        <div className="blob blob-4" />
        <div className="blob blob-5" />
        <div className="blob blob-6" />
        <div className="blob blob-7" />

        {/* ── Splash ─────────────────────────────────────────────── */}
        {phase !== 'form' && (
          <div className={`splash${phase === 'exit' ? ' splash-exit' : ''}`}>
            <div className="splash-iso-wrap">
              <div className="splash-iso-gradient" />
            </div>
            <div className="splash-hola">hola</div>
            <p className="splash-tagline">Tu dashboard te espera</p>
          </div>
        )}

        {/* ── Form card ──────────────────────────────────────────── */}
        {phase === 'form' && (
          <div className="auth-card">
            {children}
          </div>
        )}
      </div>
    </>
  )
}
