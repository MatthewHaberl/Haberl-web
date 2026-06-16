'use client'

import { useRef, useCallback } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Grid } from '@react-three/drei'
import { Building } from './Building'
import { CableRoute3D } from './CableRoute3D'
import { RouteLabel } from './RouteLabel'
import type { LayoutModel } from '@/lib/solar/job-layout-3d'

// ── Screenshot helper ────────────────────────────────────────────────────────

function ScreenshotCapture({ onReady }: { onReady: (fn: () => void) => void }) {
  const { gl } = useThree()
  const capture = useCallback(() => {
    gl.domElement.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'job-layout.png'
      a.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }, [gl])

  const ready = useRef(false)
  if (!ready.current) { ready.current = true; onReady(capture) }

  return null
}

// ── Scene ─────────────────────────────────────────────────────────────────────

function Scene({ model }: { model: LayoutModel }) {
  return (
    <>
      <color attach="background" args={['#1e293b']} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[10, 20, 10]} intensity={1.2} />
      <directionalLight position={[-8, 12, -8]} intensity={0.4} />
      <hemisphereLight args={['#bfdbfe', '#334155', 0.6]} />

      <Building model={model} />

      {model.cableRoutes.map((route) => (
        <group key={route.id}>
          <CableRoute3D route={route} />
          <RouteLabel route={route} />
        </group>
      ))}

      <Grid
        position={[0, -0.01, 0]}
        args={[40, 40]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#94a3b8"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#64748b"
        fadeDistance={30}
        fadeStrength={1}
        infiniteGrid
      />

      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        minDistance={3}
        maxDistance={60}
        target={[0, model.wallH / 2, 0]}
      />
    </>
  )
}

// ── Viewer ────────────────────────────────────────────────────────────────────

interface JobLayout3DViewerProps {
  model: LayoutModel
  jobId: string
}

export function JobLayout3DViewer({ model, jobId }: JobLayout3DViewerProps) {
  const screenshotFnRef = useRef<(() => void) | null>(null)

  const handleScreenshot = () => {
    screenshotFnRef.current?.()
  }

  const onReady = useCallback((fn: () => void) => {
    screenshotFnRef.current = fn
  }, [])

  return (
    <div className="relative w-full" style={{ height: 480 }}>
      <Canvas
        camera={{ position: [model.buildingW * 1.8, model.wallH * 2, model.buildingD * 2.2], fov: 45 }}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        style={{ borderRadius: 8 }}
      >
        <Scene model={model} />
        <ScreenshotCapture onReady={onReady} />
      </Canvas>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 flex flex-col gap-1 pointer-events-none">
        {([
          { color: '#f97316', label: 'DC string' },
          { color: '#2563eb', label: 'AC run' },
          { color: '#16a34a', label: 'Battery' },
          { color: '#65a30d', label: 'Earth' },
        ] as const).map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span style={{ display: 'inline-block', width: 16, height: 3, background: color, borderRadius: 2 }} />
            <span className="text-xs" style={{ color: '#94a3b8', textShadow: '0 1px 2px #000' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Controls hint */}
      <div className="absolute top-3 right-3 text-xs pointer-events-none" style={{ color: '#64748b' }}>
        Drag to orbit · scroll to zoom
      </div>

      {/* Screenshot button */}
      <button
        onClick={handleScreenshot}
        className="absolute top-3 left-3 text-xs px-2 py-1 rounded bg-black/50 text-slate-300 hover:bg-black/70 transition-colors"
        title={`Save layout PNG for job ${jobId}`}
      >
        Save PNG
      </button>
    </div>
  )
}
