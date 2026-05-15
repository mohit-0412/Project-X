import { openDB } from 'idb'

export type TrackPoint = {
  id?: number
  latitude: number
  longitude: number
  accuracy: number | null
  speed: number | null
  timestamp: number
}

const DB_NAME = 'movement-tracker'
const STORE_NAME = 'points'

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

export async function insertPoint(point: TrackPoint) {
  const db = await getDb()
  await db.add(STORE_NAME, point)
}

export async function getPointsForDay(day: Date): Promise<TrackPoint[]> {
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

export async function clearPointsForDay(day: Date) {
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
