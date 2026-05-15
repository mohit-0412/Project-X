import { useEffect, useRef } from 'react'
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import type { Map as MapLibreMap } from 'maplibre-gl'

const THUMB_TIP = 4
const INDEX_TIP = 8
const WRIST = 0

// Lower sensitivity
const MIN_ROT_DELTA = 0.004
const MIN_TWO_HAND_DELTA = 0.012
const OPEN_HAND_PINCH_2D = 0.08
const ROTATION_GAIN = 50
const ZOOM_TWO_HAND_GAIN = 5
const ROTATION_DAMPING = 0.92
const ZOOM_DAMPING = 0.88
const MIN_ZOOM = 1
const MAX_ZOOM = 18

function mirrorX(x: number) {
  return 1 - x
}

function clampZoom(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

type UseHandGesturesOptions = {
  enabled: boolean
  mapRef: React.RefObject<MapLibreMap | null>
  videoRef: React.RefObject<HTMLVideoElement | null>
  onStatus: (message: string) => void
  onError: (message: string) => void
}

export function useHandGestures({
  enabled,
  mapRef,
  videoRef,
  onStatus,
  onError,
}: UseHandGesturesOptions) {
  const landmarkerRef = useRef<HandLandmarker | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const frameRef = useRef<number | null>(null)
  const lastWristXRef = useRef<number | null>(null)
  const lastTwoHandDistRef = useRef<number | null>(null)
  const bearingVelocityRef = useRef(0)
  const zoomVelocityRef = useRef(0)
  const lastVideoTimeRef = useRef(-1)

  useEffect(() => {
    if (!enabled) {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }
      landmarkerRef.current?.close()
      landmarkerRef.current = null
      lastWristXRef.current = null
      lastTwoHandDistRef.current = null
      bearingVelocityRef.current = 0
      zoomVelocityRef.current = 0
      lastVideoTimeRef.current = -1
      return
    }

    let cancelled = false

    const start = async () => {
      try {
        onStatus('Requesting camera permission...')
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: 640, height: 480 },
          audio: false,
        })

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = stream
        const video = videoRef.current
        if (!video) {
          throw new Error('Camera preview not ready.')
        }

        video.srcObject = stream
        await video.play()

        onStatus('Loading hand tracking...')
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm',
        )

        const landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
        })

        if (cancelled) {
          landmarker.close()
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        landmarkerRef.current = landmarker
        onStatus(
          '1 hand open + slide left/right: rotate 360°. 2 hands: spread apart = zoom in, bring together = zoom out.',
        )

        const detect = () => {
          if (cancelled || !landmarkerRef.current || !videoRef.current) return

          const map = mapRef.current
          const vid = videoRef.current

          if (map) {
            if (Math.abs(bearingVelocityRef.current) > 0.01) {
              map.setBearing(map.getBearing() + bearingVelocityRef.current)
              bearingVelocityRef.current *= ROTATION_DAMPING
            } else {
              bearingVelocityRef.current = 0
            }

            if (Math.abs(zoomVelocityRef.current) > 0.002) {
              map.zoomTo(clampZoom(map.getZoom() + zoomVelocityRef.current), { duration: 0 })
              zoomVelocityRef.current *= ZOOM_DAMPING
            } else {
              zoomVelocityRef.current = 0
            }
          }

          if (vid.readyState >= 2 && vid.currentTime !== lastVideoTimeRef.current) {
            lastVideoTimeRef.current = vid.currentTime
            const results = landmarkerRef.current.detectForVideo(vid, performance.now())
            const hands = results.landmarks

            if (!map || hands.length === 0) {
              lastWristXRef.current = null
              lastTwoHandDistRef.current = null
            } else if (hands.length >= 2) {
              lastWristXRef.current = null

              const leftWrist = hands[0][WRIST]
              const rightWrist = hands[1][WRIST]
              const handDistance = Math.hypot(
                leftWrist.x - rightWrist.x,
                leftWrist.y - rightWrist.y,
              )

              if (lastTwoHandDistRef.current !== null) {
                const delta = handDistance - lastTwoHandDistRef.current
                if (Math.abs(delta) > MIN_TWO_HAND_DELTA) {
                  zoomVelocityRef.current += delta * ZOOM_TWO_HAND_GAIN
                }
              }

              lastTwoHandDistRef.current = handDistance
            } else {
              lastTwoHandDistRef.current = null

              const hand = hands[0]
              const thumb = hand[THUMB_TIP]
              const index = hand[INDEX_TIP]
              const wrist = hand[WRIST]
              const pinch2d = Math.hypot(thumb.x - index.x, thumb.y - index.y)
              const isOpenHand = pinch2d >= OPEN_HAND_PINCH_2D
              const wristX = mirrorX(wrist.x)

              if (isOpenHand) {
                if (lastWristXRef.current !== null) {
                  const dx = wristX - lastWristXRef.current
                  if (Math.abs(dx) > MIN_ROT_DELTA) {
                    bearingVelocityRef.current += dx * ROTATION_GAIN
                  }
                }
                lastWristXRef.current = wristX
              } else {
                lastWristXRef.current = null
              }
            }
          }

          frameRef.current = requestAnimationFrame(detect)
        }

        frameRef.current = requestAnimationFrame(detect)
      } catch (error) {
        const message =
          error instanceof DOMException && error.name === 'NotAllowedError'
            ? 'Camera permission denied. Allow camera access to use hand gestures.'
            : error instanceof Error
              ? error.message
              : 'Failed to start hand gesture control.'
        onError(message)
      }
    }

    void start()

    return () => {
      cancelled = true
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }
      landmarkerRef.current?.close()
      landmarkerRef.current = null
      lastWristXRef.current = null
      lastTwoHandDistRef.current = null
      bearingVelocityRef.current = 0
      zoomVelocityRef.current = 0
      lastVideoTimeRef.current = -1
    }
  }, [enabled, mapRef, videoRef, onStatus, onError])
}
