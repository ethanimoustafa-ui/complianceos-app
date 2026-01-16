import Link from 'next/link'
import { Icon } from '@iconify/react'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 bg-white border-b border-slate-200 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center transform group-hover:scale-105 transition-transform duration-300">
              <Icon icon="lucide:shield-check" className="text-white text-2xl" />
            </div>
            <span className="text-xl font-display font-bold text-slate-900">ComplianceOS</span>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-20 min-h-screen">
        {children}
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 py-4">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between text-sm">
          <p className="text-slate-500">© 2026 ComplianceOS. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link href="#" className="text-slate-600 hover:text-emerald-600 transition-colors">
              Privacy Policy
            </Link>
            <Link href="#" className="text-slate-600 hover:text-emerald-600 transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
