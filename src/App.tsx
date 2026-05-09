import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { openDB } from 'idb'
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl'
import './App.css'

type TrackPoint = {
  id?: number
  latitude: number
  longitude: number
  accuracy: number | null
  speed: number | null
  timestamp: number
}

const DB_NAME = 'movement-tracker'
const STORE_NAME = 'points'
const FALLBACK_CENTER: [number, number] = [28.6139, 77.209]
const ROUTE_SOURCE_ID = 'route-source'
const LATEST_SOURCE_ID = 'latest-source'
const MIN_ZOOM = 1
const MAX_ZOOM = 18
const SPACE_OVERLAY_ZOOM = 3.5

async function getDb() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        })
        store.createIndex('by-timestamp', 'timestamp')
      }
    },
  })
}

async function insertPoint(point: TrackPoint) {
  const db = await getDb()
  await db.add(STORE_NAME, point)
}

async function getPointsForDay(day: Date): Promise<TrackPoint[]> {
  const db = await getDb()
  const start = new Date(day)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  const points = await db.getAllFromIndex(
    STORE_NAME,
    'by-timestamp',
    IDBKeyRange.bound(start.getTime(), end.getTime(), false, true),
  )
  return points as TrackPoint[]
}

async function clearPointsForDay(day: Date) {
  const points = await getPointsForDay(day)
  const db = await getDb()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  for (const point of points) {
    if (typeof point.id === 'number') {
      await tx.store.delete(point.id)
    }
  }
  await tx.done
}

function App() {
  const [tracking, setTracking] = useState(false)
  const [points, setPoints] = useState<TrackPoint[]>([])
  const [status, setStatus] = useState('Ready')
  const [showSpaceOverlay, setShowSpaceOverlay] = useState(true)
  const watchIdRef = useRef<number | null>(null)
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const introCompleteRef = useRef(false)
  const today = useMemo(() => new Date(), [])

  const loadTodayPoints = useCallback(async () => {
    const rows = await getPointsForDay(today)
    setPoints(rows.sort((a, b) => a.timestamp - b.timestamp))
  }, [today])

  useEffect(() => {
    loadTodayPoints().catch((error) => {
      setStatus(`Failed to load points: ${(error as Error).message}`)
    })

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
  }, [loadTodayPoints])

  const startTracking = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus('Geolocation is not available in this browser.')
      return
    }
    if (watchIdRef.current !== null) {
      return
    }
    setStatus('Tracking started')
    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const nextPoint: TrackPoint = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy ?? null,
          speed: position.coords.speed ?? null,
          timestamp: position.timestamp || Date.now(),
        }
        await insertPoint(nextPoint)
        await loadTodayPoints()
        setStatus(`Saved point at ${new Date(nextPoint.timestamp).toLocaleTimeString()}`)
      },
      (error) => {
        setStatus(`Tracking error: ${error.message}`)
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000,
      },
    )
    watchIdRef.current = watchId
    setTracking(true)
  }, [loadTodayPoints])

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    setTracking(false)
    setStatus('Tracking paused')
  }, [])

  const clearToday = useCallback(async () => {
    await clearPointsForDay(today)
    await loadTodayPoints()
    setStatus('Cleared all points for today')
  }, [loadTodayPoints, today])

  const center = useMemo<[number, number]>(() => {
    const last = points[points.length - 1]
    return last ? [last.latitude, last.longitude] : FALLBACK_CENTER
  }, [points])

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        projection: {
          type: 'globe',
        },
        sources: {
          osm: {
            type: 'raster',
            tiles: [
              'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
              'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
              'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
            ],
            tileSize: 256,
            minzoom: MIN_ZOOM,
            maxzoom: MAX_ZOOM,
            attribution: '© OpenStreetMap contributors',
          },
          satellite: {
            type: 'raster',
            tiles: [
              'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            ],
            tileSize: 256,
            minzoom: MIN_ZOOM,
            maxzoom: MAX_ZOOM,
            attribution: 'Source: Esri, Maxar, Earthstar Geographics',
          },
        },
        layers: [
          {
            id: 'space-bg',
            type: 'background',
            paint: {
              'background-color': '#000000',
            },
          },
          {
            id: 'osm',
            type: 'raster',
            source: 'osm',
            layout: {
              visibility: 'none',
            },
          },
          {
            id: 'satellite',
            type: 'raster',
            source: 'satellite',
          },
        ],
      },
      center: [0, 20],
      zoom: 1.4,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    setShowSpaceOverlay(map.getZoom() <= SPACE_OVERLAY_ZOOM)

    map.on('load', () => {
      map.addSource(ROUTE_SOURCE_ID, {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [],
          },
          properties: {},
        },
      })
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: ROUTE_SOURCE_ID,
        paint: {
          'line-color': '#2563eb',
          'line-width': 4,
        },
      })

      map.addSource(LATEST_SOURCE_ID, {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [center[1], center[0]],
          },
          properties: {},
        },
      })
      map.addLayer({
        id: 'latest-point',
        type: 'circle',
        source: LATEST_SOURCE_ID,
        paint: {
          'circle-radius': 7,
          'circle-color': '#dc2626',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      })

      window.setTimeout(() => {
        map.flyTo({
          center: [center[1], center[0]],
          zoom: 14,
          speed: 0.5,
          curve: 1.6,
          essential: true,
        })
        introCompleteRef.current = true
      }, 700)
    })

    map.on('zoom', () => {
      setShowSpaceOverlay(map.getZoom() <= SPACE_OVERLAY_ZOOM)
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [center])

  useEffect(() => {
    const map = mapRef.current
    if (!map) {
      return
    }

    const routeSource = map.getSource(ROUTE_SOURCE_ID) as GeoJSONSource | undefined
    if (routeSource) {
      routeSource.setData({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: points.map((point) => [point.longitude, point.latitude]),
        },
        properties: {},
      })
    }

    const latestSource = map.getSource(LATEST_SOURCE_ID) as GeoJSONSource | undefined
    if (latestSource) {
      latestSource.setData({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [center[1], center[0]],
        },
        properties: {},
      })
    }

    if (introCompleteRef.current) {
      map.easeTo({
        center: [center[1], center[0]],
        duration: 450,
      })
    }
  }, [center, points])

  return (
    <div className="app">
      <header>
        <h1>Local Movement Tracker</h1>
        <p>Only for Fun</p>
      </header>

      <section className="controls">
        <button type="button" className="primary" onClick={tracking ? stopTracking : startTracking}>
          {tracking ? 'Pause Tracking' : 'Start Tracking'}
        </button>
        <button type="button" onClick={() => void loadTodayPoints()}>
          Refresh
        </button>
        <button type="button" className="danger" onClick={() => void clearToday()}>
          Clear Today
        </button>
      </section>

      <p className="status">{status}</p>

      <section className="map-wrap">
        <div ref={mapContainerRef} className="map" />
        {showSpaceOverlay ? (
          <div className="space-overlay" aria-hidden="true">
            <span className="sun-glow" />
            <span className="planet-label label-sun">Sun</span>
            <span className="moon" />
            <span className="planet-label label-moon">Moon</span>
          </div>
        ) : null}
      </section>

      <section className="timeline">
        <h2>Today's Movement ({points.length} points)</h2>
        {points.length === 0 ? (
          <p>No points yet. Press Start Tracking and move around.</p>
        ) : (
          <div className="list">
            {[...points]
              .reverse()
              .slice(0, 100)
              .map((point) => (
                <article key={point.id} className="row">
                  <strong>{new Date(point.timestamp).toLocaleTimeString()}</strong>
                  <span>
                    {point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}
                  </span>
                </article>
              ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default App
