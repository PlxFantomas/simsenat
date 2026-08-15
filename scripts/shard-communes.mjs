import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, 'scripts/data-source/communes.geojson')
const target = resolve(root, 'public/data/communes')

const geojson = JSON.parse(await readFile(source, 'utf8'))
const byDepartment = new Map()

for (const feature of geojson.features) {
  const code = feature.properties?.departement
  if (!code) continue
  const features = byDepartment.get(code) ?? []
  features.push(feature)
  byDepartment.set(code, features)
}

await mkdir(target, { recursive: true })

for (const [code, features] of byDepartment) {
  await writeFile(
    resolve(target, `${code}.geojson`),
    JSON.stringify({ type: 'FeatureCollection', features }),
  )
}

console.log(`Created ${byDepartment.size} department shards from ${geojson.features.length} communes.`)
