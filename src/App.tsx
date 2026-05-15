import { useState } from 'react'
import { HomePage } from './pages/HomePage'
import { TrackingPage } from './pages/TrackingPage'
import './App.css'

type Page = 'home' | 'tracking'

function App() {
  const [page, setPage] = useState<Page>('home')

  if (page === 'tracking') {
    return <TrackingPage onBack={() => setPage('home')} />
  }

  return <HomePage onStartTracking={() => setPage('tracking')} />
}

export default App
