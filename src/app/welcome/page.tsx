'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { useTranslation } from '@/i18n'

export default function WelcomePage() {
  const router = useRouter()
  const { t, isRTL } = useTranslation()
  const [isPortalActive, setIsPortalActive] = useState(false)
  const [showContent, setShowContent] = useState(false)

  useEffect(() => {
    // Trigger content animation after initial load
    const timer = setTimeout(() => setShowContent(true), 100)
    return () => clearTimeout(timer)
  }, [])

  const handleEnterDashboard = () => {
    setIsPortalActive(true)
    // Set flag for dashboard fade-in animation
    sessionStorage.setItem('fromWelcome', 'true')
    // Navigate after portal animation completes
    setTimeout(() => {
      router.push('/dashboard')
    }, 950)
  }

  return (
    <div
      className={`fixed inset-0 overflow-hidden ${isPortalActive ? 'portal-active' : ''}`}
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {/* Base background */}
      <div className="absolute inset-0 bg-[#010409]" />

      {/* Aurora surge gradient */}
      <div className="absolute inset-0 aurora-surge opacity-60" />

      {/* Carbon fiber texture overlay */}
      <div className="absolute inset-0 carbon-fiber-texture opacity-20" />

      {/* Grid pattern overlay */}
      <div className="absolute inset-0 grid-pattern opacity-10" />

      {/* Particle storm - emerald particles */}
      <div className="particle-container">
        {[...Array(20)].map((_, i) => (
          <div
            key={`emerald-${i}`}
            className="particle particle-emerald"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 5}s`,
              animationDuration: `${3 + Math.random() * 4}s`,
            }}
          />
        ))}
        {/* Blue particles */}
        {[...Array(15)].map((_, i) => (
          <div
            key={`blue-${i}`}
            className="particle particle-blue"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 5}s`,
              animationDuration: `${3 + Math.random() * 4}s`,
            }}
          />
        ))}
      </div>

      {/* Geometric shapes dancing */}
      <div className="geometric-shapes">
        {[...Array(8)].map((_, i) => (
          <div
            key={`shape-${i}`}
            className={`geometric-shape ${i % 2 === 0 ? 'shape-square' : 'shape-circle'}`}
            style={{
              left: `${10 + Math.random() * 80}%`,
              top: `${10 + Math.random() * 80}%`,
              animationDelay: `${Math.random() * 3}s`,
            }}
          />
        ))}
      </div>

      {/* Radial convergence rings */}
      <div className="radial-rings">
        {[...Array(4)].map((_, i) => (
          <div
            key={`ring-${i}`}
            className="radial-ring"
            style={{
              animationDelay: `${i * 0.5}s`,
            }}
          />
        ))}
      </div>

      {/* Main content container */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6">
        {/* Logo with orbiting particles */}
        <div className={`logo-container ${showContent ? 'logo-materialize' : 'opacity-0'}`}>
          <div className="relative">
            {/* Orbiting particles around logo */}
            <div className="orbit-container">
              {[...Array(6)].map((_, i) => (
                <div
                  key={`orbit-${i}`}
                  className="orbit-particle"
                  style={{
                    animationDelay: `${i * 0.5}s`,
                    transform: `rotate(${i * 60}deg) translateX(40px)`,
                  }}
                />
              ))}
            </div>

            {/* Logo icon */}
            <div className="w-28 h-28 rounded-2xl bg-gradient-to-br from-emerald-500 to-blue-600 flex items-center justify-center shadow-2xl shadow-emerald-500/30">
              <Icon icon="lucide:layers" className="text-white text-6xl" />
            </div>
          </div>
        </div>

        {/* Title with slam/wake animation */}
        <h1
          className={`mt-10 text-6xl md:text-7xl font-display font-bold text-white tracking-tight ${showContent ? 'text-slam-wake' : 'opacity-0'}`}
          style={{ animationDelay: '0.3s' }}
        >
          {t('welcome.title')}
        </h1>

        {/* Animated gradient underline */}
        <div
          className={`mt-4 h-1 bg-gradient-to-r from-emerald-500 via-blue-500 to-emerald-500 rounded-full ${showContent ? 'draw-underline' : 'w-0'}`}
          style={{ animationDelay: '0.7s' }}
        />

        {/* Tagline */}
        <p
          className={`mt-6 text-xl md:text-2xl text-slate-400 font-light tracking-wide ${showContent ? 'fade-up-tagline' : 'opacity-0'}`}
          style={{ animationDelay: '0.9s' }}
        >
          {t('welcome.tagline')}
        </p>

        {/* CTA Button with gravitational pulse */}
        <button
          onClick={handleEnterDashboard}
          disabled={isPortalActive}
          className={`mt-12 group relative px-10 py-4 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-semibold text-lg rounded-xl overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-emerald-500/30 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed ${showContent ? 'button-appear' : 'opacity-0'}`}
          style={{ animationDelay: '1.3s' }}
        >
          {/* Gravitational pulse effect */}
          <span className="absolute inset-0 gravitational-pulse" />

          <span className={`relative z-10 flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
            {t('welcome.enterDashboard')}
            <Icon
              icon={isRTL ? 'lucide:arrow-left' : 'lucide:arrow-right'}
              className="text-xl transition-transform group-hover:translate-x-1"
            />
          </span>
        </button>

        {/* Scanline effect */}
        <div className="scanline" />
      </div>

      {/* Portal exit overlay */}
      {isPortalActive && (
        <div className="portal-overlay" />
      )}
    </div>
  )
}
