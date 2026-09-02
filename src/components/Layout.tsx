import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import Lenis from 'lenis'
import TopBar from '@/components/TopBar'
import Sidebar from '@/components/Sidebar'
import Footer from '@/components/Footer'

// App shell: fixed 56px TopBar + 248px collapsible Sidebar + content slot +
// 40px footer. Layout owns the 56px top offset — pages never compensate.

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()

  // Lenis smooth scrolling on the main content container (lerp 0.12).
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) return
    const lenis = new Lenis({ wrapper: el, content: el.firstElementChild as HTMLElement, lerp: 0.12 })
    let raf = 0
    const loop = (time: number) => {
      lenis.raf(time)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      lenis.destroy()
    }
  }, [])

  // Reset scroll on route change.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [pathname])

  return (
    <div className="min-h-[100dvh] bg-bg-base">
      <TopBar />
      <div className="flex h-[100dvh] pt-14">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <div ref={scrollRef} className="bg-dots min-h-0 flex-1 overflow-y-auto">
            <main className="mx-auto w-full max-w-[1440px] p-6 [@media(min-width:1600px)]:p-8">
              <Outlet />
            </main>
          </div>
          <Footer />
        </div>
      </div>
    </div>
  )
}
