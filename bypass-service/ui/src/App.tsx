import { useEffect, useState } from 'react'
import { RenewalDashboard } from './components/RenewalDashboard'

function App() {
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    // Apply dark mode by default
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

  return (
    <div className="min-h-screen bg-background">
      <header className="glass-header border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary/10 border border-primary/20 rounded-md flex items-center justify-center">
              <span className="text-primary font-bold text-lg">⚡</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Renewal Service</h1>
              <p className="text-xs text-muted-foreground">Auto Renewal Management</p>
            </div>
          </div>
          <button
            onClick={() => setIsDark(!isDark)}
            className="px-3 py-2 rounded-md bg-secondary hover:bg-secondary/80 transition-colors"
          >
            {isDark ? '🌞' : '🌙'}
          </button>
        </div>
      </header>
      <main className="container mx-auto px-4 pt-2 pb-6">
        <RenewalDashboard />
      </main>
    </div>
  )
}

export default App
