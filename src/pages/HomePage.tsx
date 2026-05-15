import '../App.css'

type HomePageProps = {
  onStartTracking: () => void
}

export function HomePage({ onStartTracking }: HomePageProps) {
  return (
    <div className="app home-page">
      <header>
        <h1>Local Movement Tracker</h1>
        <p>Only for Fun</p>
      </header>

      <section className="home-hero">
        <p className="home-tagline">Track where you go. Replay your route on the map.</p>
        <button type="button" className="primary home-start-btn" onClick={onStartTracking}>
          Start Tracking
        </button>
      </section>
    </div>
  )
}
