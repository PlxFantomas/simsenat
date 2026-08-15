export type Position = [number, number]

export interface GeoProperties {
  code: string
  nom: string
  departement?: string
  region?: string
}

export interface PolygonGeometry {
  type: 'Polygon'
  coordinates: Position[][]
}

export interface MultiPolygonGeometry {
  type: 'MultiPolygon'
  coordinates: Position[][][]
}

export type GeoGeometry = PolygonGeometry | MultiPolygonGeometry

export interface GeoFeature {
  type: 'Feature'
  properties: GeoProperties
  geometry: GeoGeometry
}

export interface GeoFeatureCollection {
  type: 'FeatureCollection'
  features: GeoFeature[]
}

interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

const ringsFor = (geometry: GeoGeometry): Position[][] =>
  geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat()

export const getBounds = (features: GeoFeature[]): Bounds => {
  const bounds: Bounds = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  }

  for (const feature of features) {
    for (const ring of ringsFor(feature.geometry)) {
      for (const [longitude, latitude] of ring) {
        bounds.minX = Math.min(bounds.minX, longitude)
        bounds.maxX = Math.max(bounds.maxX, longitude)
        bounds.minY = Math.min(bounds.minY, latitude)
        bounds.maxY = Math.max(bounds.maxY, latitude)
      }
    }
  }

  return bounds
}

export const createPathBuilder = (
  features: GeoFeature[],
  width: number,
  height: number,
  padding = 12,
  options: { geographicAspect?: boolean } = {},
) => {
  const bounds = getBounds(features)
  const latitudeCenter = (bounds.minY + bounds.maxY) / 2
  const longitudeFactor = options.geographicAspect
    ? Math.cos((latitudeCenter * Math.PI) / 180)
    : 1
  const longitudeSpan = Math.max(
    0.0001,
    (bounds.maxX - bounds.minX) * longitudeFactor,
  )
  const latitudeSpan = Math.max(0.0001, bounds.maxY - bounds.minY)
  const scale = Math.min(
    (width - padding * 2) / longitudeSpan,
    (height - padding * 2) / latitudeSpan,
  )
  const renderedWidth = longitudeSpan * scale
  const renderedHeight = latitudeSpan * scale
  const offsetX = (width - renderedWidth) / 2
  const offsetY = (height - renderedHeight) / 2

  const project = ([longitude, latitude]: Position): Position => [
    offsetX + (longitude - bounds.minX) * longitudeFactor * scale,
    offsetY + (bounds.maxY - latitude) * scale,
  ]

  const ringToPath = (ring: Position[]) =>
    ring
      .map((position, index) => {
        const [x, y] = project(position)
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
      })
      .join('') + 'Z'

  return (geometry: GeoGeometry) =>
    ringsFor(geometry).map(ringToPath).join('')
}

export const featureCentroid = (feature: GeoFeature): Position => {
  const positions = ringsFor(feature.geometry).flat()
  if (!positions.length) return [0, 0]
  const [totalX, totalY] = positions.reduce(
    ([sumX, sumY], [x, y]) => [sumX + x, sumY + y],
    [0, 0],
  )
  return [totalX / positions.length, totalY / positions.length]
}

export const fetchGeoJSON = async (url: string, signal?: AbortSignal) => {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Impossible de charger la carte (${response.status}).`)
  return (await response.json()) as GeoFeatureCollection
}
