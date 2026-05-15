export type MapPoint = {
  id: string
  name: string
  description: string
  latitude: number
  longitude: number
}

export const MAP_POINTS: MapPoint[] = [
  {
    id: 'india-gate',
    name: 'India Gate',
    description: 'A war memorial in New Delhi, built to honor soldiers of the British Indian Army.',
    latitude: 28.6129,
    longitude: 77.2295,
  },
  {
    id: 'taj-mahal',
    name: 'Taj Mahal',
    description: 'An ivory-white marble mausoleum in Agra, one of the most famous landmarks in the world.',
    latitude: 27.1751,
    longitude: 78.0421,
  },
  {
    id: 'eiffel-tower',
    name: 'Eiffel Tower',
    description: 'A wrought-iron lattice tower on the Champ de Mars in Paris, France.',
    latitude: 48.8584,
    longitude: 2.2945,
  },
  {
    id: 'statue-liberty',
    name: 'Statue of Liberty',
    description: 'A colossal neoclassical sculpture on Liberty Island in New York Harbor.',
    latitude: 40.6892,
    longitude: -74.0445,
  },
  {
    id: 'great-wall',
    name: 'Great Wall of China',
    description: 'A series of fortifications built across northern China to protect against invasions.',
    latitude: 40.4319,
    longitude: 116.5704,
  },
  {
    id: 'sydney-opera',
    name: 'Sydney Opera House',
    description: 'A multi-venue performing arts centre on the harbour in Sydney, Australia.',
    latitude: -33.8568,
    longitude: 151.2153,
  },
]
