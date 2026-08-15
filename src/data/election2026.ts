export type Nuance =
  | 'RN'
  | 'UDR'
  | 'LR'
  | 'DVD'
  | 'Renaissance'
  | 'Horizons'
  | 'Modem'
  | 'DVC'
  | 'PS'
  | 'Ecologistes'
  | 'PCF'
  | 'LFI'
  | 'Régionalistes'
  | 'Divers/SE'

export const NUANCE_COLORS: Record<Nuance, string> = {
  RN: '#af906a',
  UDR: '#162561',
  LR: '#0890c5',
  DVD: '#8FE1FF',
  Renaissance: '#ffeb00',
  Horizons: '#0001b8',
  Modem: '#ff9f0e',
  DVC: '#e1b000',
  PS: '#ff8080',
  Ecologistes: '#00c000',
  PCF: '#dd0000',
  LFI: '#cc2443',
  Régionalistes: '#78668d',
  'Divers/SE': '#957cb5',
}

export const NUANCES = Object.keys(NUANCE_COLORS) as Nuance[]

export type VotingMethod = 'proportional' | 'majority'

export interface Department2026 {
  code: string
  name: string
  seats: number
  zone: 'metropolitan' | 'overseas'
  officialElectors?: number
  municipalDelegates?: number
}

const rows: Array<[string, string, number, Department2026['zone']?]> = [
  ['01', 'Ain', 3],
  ['02', 'Aisne', 3],
  ['03', 'Allier', 2],
  ['04', 'Alpes-de-Haute-Provence', 1],
  ['05', 'Hautes-Alpes', 1],
  ['06', 'Alpes-Maritimes', 5],
  ['07', 'Ardèche', 2],
  ['08', 'Ardennes', 2],
  ['09', 'Ariège', 1],
  ['10', 'Aube', 2],
  ['11', 'Aude', 2],
  ['12', 'Aveyron', 2],
  ['13', 'Bouches-du-Rhône', 8],
  ['14', 'Calvados', 3],
  ['15', 'Cantal', 2],
  ['16', 'Charente', 2],
  ['17', 'Charente-Maritime', 3],
  ['18', 'Cher', 2],
  ['19', 'Corrèze', 2],
  ['2A', 'Corse-du-Sud', 1],
  ['2B', 'Haute-Corse', 1],
  ['21', "Côte-d'Or", 3],
  ['22', "Côtes-d'Armor", 3],
  ['23', 'Creuse', 2],
  ['24', 'Dordogne', 2],
  ['25', 'Doubs', 3],
  ['26', 'Drôme', 3],
  ['27', 'Eure', 3],
  ['28', 'Eure-et-Loir', 3],
  ['29', 'Finistère', 4],
  ['30', 'Gard', 3],
  ['31', 'Haute-Garonne', 5],
  ['32', 'Gers', 2],
  ['33', 'Gironde', 6],
  ['34', 'Hérault', 4],
  ['35', 'Ille-et-Vilaine', 4],
  ['36', 'Indre', 2],
  ['67', 'Bas-Rhin', 5],
  ['68', 'Haut-Rhin', 4],
  ['69', 'Rhône', 7],
  ['70', 'Haute-Saône', 2],
  ['71', 'Saône-et-Loire', 3],
  ['72', 'Sarthe', 3],
  ['73', 'Savoie', 2],
  ['74', 'Haute-Savoie', 3],
  ['76', 'Seine-Maritime', 6],
  ['79', 'Deux-Sèvres', 2],
  ['80', 'Somme', 3],
  ['81', 'Tarn', 2],
  ['82', 'Tarn-et-Garonne', 2],
  ['83', 'Var', 4],
  ['84', 'Vaucluse', 3],
  ['85', 'Vendée', 3],
  ['86', 'Vienne', 2],
  ['87', 'Haute-Vienne', 2],
  ['88', 'Vosges', 2],
  ['89', 'Yonne', 2],
  ['90', 'Territoire de Belfort', 1],
  ['973', 'Guyane', 2, 'overseas'],
  ['977', 'Saint-Barthélemy', 1, 'overseas'],
  ['978', 'Saint-Martin', 1, 'overseas'],
  ['986', 'Wallis-et-Futuna', 1, 'overseas'],
  ['987', 'Polynésie française', 2, 'overseas'],
]

const electoralColleges: Record<string, [municipalDelegates: number, totalElectors: number]> = {
  '01': [1957, 2025], '02': [1682, 1747], '03': [916, 970], '04': [528, 565],
  '05': [412, 449], '06': [1999, 2094], '07': [972, 1022], '08': [913, 964],
  '09': [591, 624], '10': [978, 1026], '11': [1143, 1196], '12': [839, 899],
  '13': [3567, 3696], '14': [2045, 2128], '15': [496, 534], '16': [2258, 2310],
  '17': [1774, 1856], '18': [830, 884], '19': [726, 776], '2A': [451, 483],
  '2B': [578, 615], '21': [1578, 1652], '22': [1680, 1759], '23': [447, 484],
  '24': [1312, 1382], '25': [1596, 1661], '26': [1384, 1444], '27': [1847, 1919],
  '28': [1270, 1319], '29': [2258, 2348], '30': [1910, 1982], '31': [3223, 3328],
  '32': [748, 792], '33': [3612, 3744], '34': [2636, 2729], '35': [2679, 2769],
  '36': [648, 686], '67': [2752, 2848], '68': [1937, 2006], '69': [3570, 3808],
  '70': [921, 969], '71': [1599, 1684], '72': [1515, 1578], '73': [1199, 1255],
  '74': [2049, 2110], '76': [3088, 3211], '79': [1102, 1149], '80': [1745, 1817],
  '81': [1091, 1153], '82': [717, 758], '83': [2224, 2309], '84': [1262, 1318],
  '85': [1800, 1860], '86': [1147, 1202], '87': [929, 986], '88': [1143, 1196],
  '89': [1056, 1115], '90': [355, 379], '973': [505, 564], '977': [0, 21],
  '978': [0, 24], '986': [0, 22], '987': [671, 733],
}

export const DEPARTMENTS_2026: Department2026[] = rows.map(
  ([code, name, seats, zone = 'metropolitan']) => ({
    code,
    name,
    seats,
    zone,
    municipalDelegates: electoralColleges[code]?.[0],
    officialElectors: electoralColleges[code]?.[1],
  }),
)

export const DEPARTMENT_BY_CODE = new Map(
  DEPARTMENTS_2026.map((department) => [department.code, department]),
)

export const RENEWED_CODES = new Set(DEPARTMENTS_2026.map(({ code }) => code))

export const votingMethodFor = (seats: number): VotingMethod =>
  seats >= 3 ? 'proportional' : 'majority'

export const SOURCE_LINKS = {
  senate2026: 'https://senatoriales2026.senat.fr/',
  legalSeats:
    'https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006070239/LEGISCTA000006134805/2026-04-30',
  geoData:
    'https://www.data.gouv.fr/datasets/contours-administratifs',
  officialCalendar:
    'https://www.senat.fr/actualite/decouvrez-le-nouveau-site-des-elections-senatoriales-de-septembre-2026-7208.html',
}
