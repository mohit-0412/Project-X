import { useCallback, useEffect, useRef, useState } from 'react'
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl'
import { MAP_POINTS, type MapPoint } from './points'
import { useHandGestures } from './useHandGestures'
import './App.css'

const FALLBACK_CENTER: [number, number] = [28.6139, 77.209]
const POINTS_SOURCE_ID = 'map-points'
const MIN_ZOOM = 1
const MAX_ZOOM = 18
const SPACE_OVERLAY_ZOOM = 3.5

function pointsToGeoJson(selectedId: string | null) {
  return {
    type: 'FeatureCollection' as const,
    features: MAP_POINTS.map((point) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [point.longitude, point.latitude],
      },
      properties: {
        id: point.id,
        name: point.name,
        description: point.description,
        selected: point.id === selectedId,
      },
    })),
  }
}

function App() {
  const [selectedPoint, setSelectedPoint] = useState<MapPoint | null>(null)
  const [showSpaceOverlay, setShowSpaceOverlay] = useState(true)
  const [gestureEnabled, setGestureEnabled] = useState(false)
  const [gestureStatus, setGestureStatus] = useState('')
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const introCompleteRef = useRef(false)

  const handleGestureStatus = useCallback((message: string) => {
    setGestureStatus(message)
  }, [])

  const handleGestureError = useCallback((message: string) => {
    setGestureStatus(message)
    setGestureEnabled(false)
  }, [])

  useHandGestures({
    enabled: gestureEnabled,
    mapRef,
    videoRef,
    onStatus: handleGestureStatus,
    onError: handleGestureError,
  })

  const toggleGestures = () => {
    if (gestureEnabled) {
      setGestureEnabled(false)
      setGestureStatus('Hand gesture control turned off.')
      return
    }
    setGestureStatus('')
    setGestureEnabled(true)
  }

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        projection: { type: 'globe' },
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
            paint: { 'background-color': '#000000' },
          },
          {
            id: 'osm',
            type: 'raster',
            source: 'osm',
            layout: { visibility: 'none' },
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

    map.doubleClickZoom.disable()
    map.dragRotate.enable()
    map.touchZoomRotate.enableRotation()
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    setShowSpaceOverlay(map.getZoom() <= SPACE_OVERLAY_ZOOM)

    map.on('load', () => {
      map.addSource(POINTS_SOURCE_ID, {
        type: 'geojson',
        data: pointsToGeoJson(null),
      })

      map.addLayer({
        id: 'map-points-hit',
        type: 'circle',
        source: POINTS_SOURCE_ID,
        paint: {
          'circle-radius': 18,
          'circle-color': '#000000',
          'circle-opacity': 0,
        },
      })

      map.addLayer({
        id: 'map-points',
        type: 'circle',
        source: POINTS_SOURCE_ID,
        paint: {
          'circle-radius': [
            'case',
            ['boolean', ['get', 'selected'], false],
            10,
            7,
          ],
          'circle-color': [
            'case',
            ['boolean', ['get', 'selected'], false],
            '#fbbf24',
            '#2563eb',
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      })

      const handlePointDoubleClick = (
        event: maplibregl.MapLayerMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] },
      ) => {
        const feature = event.features?.[0]
        if (!feature) return

        const point = MAP_POINTS.find((p) => p.id === feature.properties?.id)
        if (!point) return

        setSelectedPoint(point)
        map.flyTo({
          center: [point.longitude, point.latitude],
          zoom: Math.max(map.getZoom(), 6),
          speed: 0.8,
          essential: true,
        })
      }

      map.on('dblclick', 'map-points-hit', handlePointDoubleClick)
      map.on('dblclick', 'map-points', handlePointDoubleClick)

      map.on('mouseenter', 'map-points-hit', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'map-points-hit', () => {
        map.getCanvas().style.cursor = ''
      })

      window.setTimeout(() => {
        map.flyTo({
          center: [FALLBACK_CENTER[1], FALLBACK_CENTER[0]],
          zoom: 2.5,
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
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const source = map.getSource(POINTS_SOURCE_ID) as GeoJSONSource | undefined
    if (source) {
      source.setData(pointsToGeoJson(selectedPoint?.id ?? null))
    }
  }, [selectedPoint])

  return (
    <div className="app">
      <header>
        <h1>Local Movement Tracker</h1>
        <p>Only for Fun</p>
      </header>

      <p className="hint">Double-click a point on the map to see details.</p>

      <section className="gesture-controls">
        <button
          type="button"
          className={gestureEnabled ? 'gesture-btn active' : 'gesture-btn'}
          onClick={toggleGestures}
        >
          {gestureEnabled ? 'Disable Hand Gestures' : 'Enable Hand Gestures'}
        </button>
        {gestureStatus ? <p className="gesture-status">{gestureStatus}</p> : null}
      </section>

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
        {gestureEnabled ? (
          <video
            ref={videoRef}
            className="gesture-preview"
            playsInline
            muted
            aria-label="Camera preview for hand gestures"
          />
        ) : null}
      </section>

      <section className="point-info">
        <h2>Point details</h2>
        {selectedPoint ? (
          <article className="info-card">
            <h3>{selectedPoint.name}</h3>
            <p>{selectedPoint.description}</p>
            <p className="coords">
              {selectedPoint.latitude.toFixed(5)}, {selectedPoint.longitude.toFixed(5)}
            </p>
          </article>
        ) : (
          <p className="info-empty">No point selected yet.</p>
        )}
      </section>
    </div>
  )
}

export default App
