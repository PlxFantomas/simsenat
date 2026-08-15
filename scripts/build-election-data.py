#!/usr/bin/env python3
"""Build the municipal shards and the provisional senatorial-list catalogue.

The browser only consumes compact, versioned JSON files. Raw national files
remain under scripts/data-source/ (gitignored). The RNE is the table of current
office-holders; municipal candidatures are used only to recover the electoral
list on which each councillor stood in March 2026.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
import urllib.error
import zipfile
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

try:
    from lxml import html
except ImportError:  # pragma: no cover - only used by the data-maintenance task
    html = None


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "scripts" / "data-source"
MUNICIPAL_OUTPUT = ROOT / "public" / "data" / "election-2026" / "departments"
LISTS_OUTPUT = ROOT / "src" / "data" / "announced-lists-2026.json"
MANIFEST_OUTPUT = ROOT / "public" / "data" / "election-2026" / "manifest.json"

DATASET_REVISION = "rne-2026-08-11_municipales-2026-03_wikipedia-2026-08-15"
RETRIEVED_DATE = "2026-08-15"
USER_AGENT = "Senatoriales2026Simulator/0.2 (local open-data build)"

DOWNLOADS = {
    "rne-councillors.csv": "https://www.data.gouv.fr/api/1/datasets/r/d5f400de-ae3f-4966-8cb6-a85c70c6c24a",
    "rne-mayors.csv": "https://www.data.gouv.fr/api/1/datasets/r/2876a346-d50c-4911-934e-19ee07b0e503",
    "municipal-candidates-t1.csv": "https://www.data.gouv.fr/api/1/datasets/r/b929c2a4-18ec-4e8b-bc37-2ff346a867cd",
    "municipal-candidates-t2.csv": "https://www.data.gouv.fr/api/1/datasets/r/c7e8ced6-3d08-452e-af06-d553634b6d61",
    "population-reference-2023.zip": "https://www.insee.fr/fr/statistiques/fichier/8680726/ensemble.zip",
}

RNE_PAGE = "https://www.data.gouv.fr/datasets/repertoire-national-des-elus-1"
CANDIDATES_T1_PAGE = "https://www.data.gouv.fr/datasets/elections-municipales-2026-listes-candidates-au-premier-tour"
CANDIDATES_T2_PAGE = "https://www.data.gouv.fr/datasets/elections-municipales-2026-listes-candidates-au-second-tour"
POPULATION_PAGE = "https://www.insee.fr/fr/statistiques/8681011"
WIKIPEDIA_API = "https://fr.wikipedia.org/w/api.php"


@dataclass(frozen=True)
class Department:
    code: str
    name: str
    seats: int
    official_municipal_delegates: int | None
    official_electors: int | None

    @property
    def method(self) -> str:
        return "proportional" if self.seats >= 3 else "majority"


@dataclass
class Councillor:
    code: str
    commune_name: str
    last_name: str
    first_name: str
    birth_date: str
    nationality: str
    role: str

    @property
    def display_name(self) -> str:
        return " ".join(part for part in (smart_case(self.first_name), smart_case(self.last_name)) if part)

    @property
    def exact_key(self) -> tuple[str, str, str]:
        return (self.code, normalize(self.last_name), normalize(self.first_name))

    @property
    def loose_key(self) -> tuple[str, str, str]:
        return (self.code, normalize(self.last_name), first_token(self.first_name))


@dataclass(frozen=True)
class CandidateMatch:
    round_number: int
    panel: str
    list_short: str
    list_name: str
    nuance_code: str
    nuance_label: str
    person_code: str

    @property
    def group_key(self) -> str:
        return f"t{self.round_number}-p{self.panel or 'x'}"


def log(message: str) -> None:
    print(message, flush=True)


def normalize(value: str | None) -> str:
    decomposed = unicodedata.normalize("NFKD", value or "")
    asciiish = "".join(char for char in decomposed if not unicodedata.combining(char))
    return re.sub(r"[^A-Z0-9]+", " ", asciiish.upper()).strip()


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", normalize(value).lower()).strip("-") or "x"


def first_token(value: str | None) -> str:
    return normalize(value).split(" ", 1)[0] if normalize(value) else ""


def smart_case(value: str | None) -> str:
    text = (value or "").strip()
    return text.title() if text and text == text.upper() else text


def stable_id(prefix: str, *parts: str) -> str:
    digest = hashlib.sha1("\x1f".join(parts).encode("utf-8")).hexdigest()[:12]
    return f"{prefix}-{digest}"


def read_departments() -> dict[str, Department]:
    source = (ROOT / "src" / "data" / "election2026.ts").read_text(encoding="utf-8")
    rows_block = source.split("const rows:", 1)[1].split("const electoralColleges", 1)[0]
    row_pattern = re.compile(
        r"^\s*\[(?P<q1>['\"])(?P<code>.+?)(?P=q1),\s*"
        r"(?P<q2>['\"])(?P<name>.+?)(?P=q2),\s*(?P<seats>\d+)",
        re.MULTILINE,
    )
    college_block = source.split("const electoralColleges", 1)[1].split("export const DEPARTMENTS", 1)[0]
    college_pattern = re.compile(r"['\"]([^'\"]+)['\"]:\s*\[(\d+),\s*(\d+)\]")
    colleges = {code: (int(municipal), int(total)) for code, municipal, total in college_pattern.findall(college_block)}
    departments: dict[str, Department] = {}
    for match in row_pattern.finditer(rows_block):
        code = match.group("code")
        municipal, total = colleges.get(code, (None, None))
        departments[code] = Department(
            code=code,
            name=match.group("name"),
            seats=int(match.group("seats")),
            official_municipal_delegates=municipal,
            official_electors=total,
        )
    if len(departments) != 63:
        raise RuntimeError(f"63 territoires renouvelés attendus, {len(departments)} trouvés")
    return departments


def request_bytes(url: str, retries: int = 4) -> bytes:
    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=180) as response:
                return response.read()
        except urllib.error.HTTPError as error:  # pragma: no cover - depends on network
            last_error = error
            if error.code == 429 and attempt + 1 < retries:
                retry_after = error.headers.get("Retry-After")
                delay = int(retry_after) if retry_after and retry_after.isdigit() else 12 * (attempt + 1)
                log(f"Wikipédia limite le débit, nouvelle tentative dans {delay} s…")
                time.sleep(delay)
                continue
            if attempt + 1 < retries:
                time.sleep(2 ** attempt)
        except Exception as error:  # pragma: no cover - depends on network
            last_error = error
            if attempt + 1 < retries:
                time.sleep(2 ** attempt)
    raise RuntimeError(f"Téléchargement impossible: {url}: {last_error}")


def download_inputs(force: bool = False) -> None:
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    for filename, url in DOWNLOADS.items():
        target = SOURCE_DIR / filename
        if target.exists() and target.stat().st_size > 1_000 and not force:
            log(f"Réutilisation {filename} ({target.stat().st_size / 1_048_576:.1f} Mio)")
            continue
        log(f"Téléchargement {filename}…")
        payload = request_bytes(url)
        target.write_bytes(payload)
        log(f"  {len(payload) / 1_048_576:.1f} Mio")


def csv_rows(path: Path) -> Iterable[dict[str, str]]:
    csv.field_size_limit(max(csv.field_size_limit(), 32 * 1024 * 1024))
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle, delimiter=";")
        if not reader.fieldnames:
            raise RuntimeError(f"En-tête CSV absent: {path}")
        for row in reader:
            yield {str(key).strip(): (value or "").strip() for key, value in row.items() if key is not None}


def pick(row: dict[str, str], *names: str) -> str:
    for name in names:
        if name in row:
            return row[name]
    normalized = {normalize(key): value for key, value in row.items()}
    for name in names:
        if normalize(name) in normalized:
            return normalized[normalize(name)]
    return ""


def record_department_code(row: dict[str, str], departments: dict[str, Department]) -> str:
    declared = pick(row, "Code du département", "Code département")
    if declared in departments:
        return declared
    commune_code = pick(row, "Code de la commune", "Code circonscription", "Code commune")
    for special_code in ("973", "977", "978", "986", "987"):
        if commune_code.startswith(special_code) and special_code in departments:
            return special_code
    return declared


ROLE_PRIORITY = {
    "MAIRE": 100,
    "PREMIER ADJOINT AU MAIRE": 90,
    "ADJOINT AU MAIRE": 80,
    "MAIRE DELEGUE": 75,
    "CONSEILLER MUNICIPAL DELEGUE": 60,
    "CONSEILLER MUNICIPAL": 50,
}


def role_priority(role: str) -> int:
    key = normalize(role)
    return max((score for label, score in ROLE_PRIORITY.items() if label in key), default=10)


def load_rne(
    departments: dict[str, Department],
) -> tuple[dict[str, list[Councillor]], dict[str, Councillor], set[tuple[str, str, str]], set[tuple[str, str, str]]]:
    people: dict[tuple[str, str, str, str, str], Councillor] = {}
    for row in csv_rows(SOURCE_DIR / "rne-councillors.csv"):
        department_code = record_department_code(row, departments)
        if department_code not in departments:
            continue
        commune_code = pick(row, "Code de la commune")
        if not commune_code:
            continue
        last_name = pick(row, "Nom de l'élu")
        first_name = pick(row, "Prénom de l'élu")
        birth_date = pick(row, "Date de naissance")
        sex = pick(row, "Code sexe")
        if not last_name or not first_name:
            continue
        person = Councillor(
            code=commune_code,
            commune_name=pick(row, "Libellé de la commune"),
            last_name=last_name,
            first_name=first_name,
            birth_date=birth_date,
            nationality=pick(row, "Code nationalité"),
            role=pick(row, "Libellé de la fonction") or "Conseiller municipal",
        )
        key = (commune_code, normalize(last_name), normalize(first_name), birth_date, sex)
        current = people.get(key)
        if current is None or role_priority(person.role) > role_priority(current.role):
            people[key] = person

    by_commune: dict[str, list[Councillor]] = defaultdict(list)
    for person in people.values():
        by_commune[person.code].append(person)
    for members in by_commune.values():
        members.sort(key=lambda person: (-role_priority(person.role), normalize(person.last_name), normalize(person.first_name)))

    mayors: dict[str, Councillor] = {}
    for row in csv_rows(SOURCE_DIR / "rne-mayors.csv"):
        department_code = record_department_code(row, departments)
        if department_code not in departments:
            continue
        commune_code = pick(row, "Code de la commune")
        last_name = pick(row, "Nom de l'élu")
        first_name = pick(row, "Prénom de l'élu")
        if not commune_code or not last_name or not first_name:
            continue
        mayors[commune_code] = Councillor(
            code=commune_code,
            commune_name=pick(row, "Libellé de la commune"),
            last_name=last_name,
            first_name=first_name,
            birth_date=pick(row, "Date de naissance"),
            nationality=pick(row, "Code nationalité"),
            role="Maire",
        )

    exact_keys = {person.exact_key for person in people.values()}
    loose_keys = {person.loose_key for person in people.values()}
    log(f"RNE: {len(people):,} conseillers uniques, {len(mayors):,} maires (série 2)")
    return by_commune, mayors, exact_keys, loose_keys


def candidate_person_key(row: dict[str, str]) -> tuple[str, str, str]:
    return (
        pick(row, "Code circonscription", "Code commune"),
        normalize(pick(row, "Nom sur le bulletin de vote", "Nom")),
        normalize(pick(row, "Prénom sur le bulletin de vote", "Prénom")),
    )


def candidate_match(row: dict[str, str], round_number: int) -> CandidateMatch:
    return CandidateMatch(
        round_number=round_number,
        panel=pick(row, "Numéro de panneau"),
        list_short=pick(row, "Libellé abrégé de liste"),
        list_name=pick(row, "Libellé de la liste") or pick(row, "Libellé abrégé de liste"),
        nuance_code=pick(row, "Code nuance de liste"),
        nuance_label=pick(row, "Nuance de liste"),
        person_code=pick(row, "Code personnalité"),
    )


def load_candidate_matches(
    departments: dict[str, Department],
    exact_keys: set[tuple[str, str, str]],
    loose_keys: set[tuple[str, str, str]],
) -> tuple[
    dict[tuple[str, str, str], list[CandidateMatch]],
    dict[tuple[str, str, str], list[CandidateMatch]],
    set[str],
]:
    exact: dict[tuple[str, str, str], list[CandidateMatch]] = defaultdict(list)
    loose: dict[tuple[str, str, str], list[CandidateMatch]] = defaultdict(list)
    communes_with_t2: set[str] = set()
    for round_number, filename in ((2, "municipal-candidates-t2.csv"), (1, "municipal-candidates-t1.csv")):
        kept = 0
        for row in csv_rows(SOURCE_DIR / filename):
            department_code = record_department_code(row, departments)
            if department_code not in departments:
                continue
            key = candidate_person_key(row)
            if not key[0] or not pick(row, "Numéro de panneau"):
                continue
            if round_number == 2:
                communes_with_t2.add(key[0])
            match = candidate_match(row, round_number)
            if key in exact_keys:
                exact[key].append(match)
                kept += 1
            loose_key = (key[0], key[1], first_token(key[2]))
            if loose_key in loose_keys:
                loose[loose_key].append(match)
        log(f"Candidatures T{round_number}: {kept:,} rapprochements exacts conservés")
    return exact, loose, communes_with_t2


def choose_match(
    person: Councillor,
    exact: dict[tuple[str, str, str], list[CandidateMatch]],
    loose: dict[tuple[str, str, str], list[CandidateMatch]],
    communes_with_t2: set[str],
) -> tuple[CandidateMatch | None, str]:
    matches = exact.get(person.exact_key, [])
    confidence = "exact"
    if not matches:
        matches = loose.get(person.loose_key, [])
        confidence = "nom-et-premier-prenom"
    if not matches:
        return None, "non-rapproche"
    decisive_round = 2 if person.code in communes_with_t2 else 1
    decisive = [match for match in matches if match.round_number == decisive_round]
    if decisive:
        return decisive[0], confidence
    return matches[0], f"{confidence}-tour-anterieur"


def load_populations() -> dict[str, int]:
    archive_path = SOURCE_DIR / "population-reference-2023.zip"
    populations: dict[str, int] = {}
    with zipfile.ZipFile(archive_path) as archive:
        candidates = [name for name in archive.namelist() if name.lower().endswith(".csv")]
        if not candidates:
            raise RuntimeError("Aucun CSV dans l'archive Insee")
        filename = max(candidates, key=lambda name: archive.getinfo(name).file_size)
        with archive.open(filename) as raw:
            import io

            reader = csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig"), delimiter=";")
            for row in reader:
                row = {str(key).strip(): (value or "").strip() for key, value in row.items() if key is not None}
                level = pick(row, "NIVGEO", "Niveau géographique")
                if level and normalize(level) not in {"COM", "COMMUNE"}:
                    continue
                code = pick(row, "CODGEO", "Code géographique", "COM")
                if len(code) == 3:
                    code = f"{pick(row, 'DEP')}{code}"
                raw_population = pick(row, "PMUN", "Population municipale")
                if not code or not raw_population:
                    continue
                try:
                    populations[code] = int(float(raw_population.replace(" ", "").replace(",", ".")))
                except ValueError:
                    continue
    log(f"Populations Insee: {len(populations):,} communes")
    return populations


def nuance(raw_code: str = "", *raw_labels: str) -> str:
    code = normalize(raw_code)
    text = " ".join(normalize(label) for label in raw_labels)
    combined = f" {code} {text} "
    if " UDR " in combined or " UNION DES DROITES POUR LA REPUBLIQUE " in combined:
        return "UDR"
    if any(marker in combined for marker in (" RASSEMBLEMENT NATIONAL ", " RN ", " LRN ", " LEXD ", " LUXD ")):
        return "RN"
    if any(marker in combined for marker in (" LES REPUBLICAINS ", " REPUBLICAINS ", " LLR ", " LR ", " LUD ")):
        return "LR"
    if any(marker in combined for marker in (" DIVERS DROITE ", " LDVD ", " DVD ")):
        return "DVD"
    if any(marker in combined for marker in (" FRANCE INSOUMISE ", " LFI ")):
        return "LFI"
    if any(marker in combined for marker in (" PARTI COMMUNISTE ", " PCF ", " LCOM ", " COM ")):
        return "PCF"
    if any(marker in combined for marker in (" ECOLOGIST", " EELV ", " LECO ", " VEC ")):
        return "Ecologistes"
    if any(marker in combined for marker in (" PARTI SOCIALISTE ", " SOCIALISTE ", " PS ", " LPS ", " LUG ", " DIVERS GAUCHE ", " LDVG ")):
        return "PS"
    if any(marker in combined for marker in (" RENAISSANCE ", " ENSEMBLE ", " LREN ", " LENS ", " LREM ", " RE ")):
        return "Renaissance"
    if " HORIZONS " in combined or " HOR " in combined:
        return "Horizons"
    if " MODEM " in combined or " MOUVEMENT DEMOCRATE " in combined:
        return "Modem"
    if any(marker in combined for marker in (" DIVERS CENTRE ", " LDVC ", " DVC ", " UDI ", " LUC ")):
        return "DVC"
    if any(marker in combined for marker in (" REGIONALIST", " LREG ", " REG ")):
        return "Régionalistes"
    return "Divers/SE"


def municipal_delegate_count(population: int | None, councillor_count: int) -> int:
    if population is not None:
        if population < 500:
            return 1
        if population < 1_500:
            return 3
        if population < 2_500:
            return 5
        if population < 3_500:
            return 7
        if population < 9_000:
            return 15
        return councillor_count
    if councillor_count <= 11:
        return 1
    if councillor_count <= 15:
        return 3
    if councillor_count <= 19:
        return 5
    if councillor_count <= 23:
        return 7
    if councillor_count <= 29:
        return 15
    return councillor_count


def extra_delegate_count(population: int | None) -> int:
    if population is None or population <= 30_000:
        return 0
    return max(0, math.floor((population - 30_000) / 800))


def largest_remainder(total: int, weights: dict[str, int]) -> dict[str, int]:
    positive = {key: value for key, value in weights.items() if value > 0}
    weight_total = sum(positive.values())
    if total <= 0 or weight_total <= 0:
        return {key: 0 for key in weights}
    raw = {key: total * value / weight_total for key, value in positive.items()}
    output = {key: math.floor(value) for key, value in raw.items()}
    remainder = total - sum(output.values())
    for key in sorted(positive, key=lambda item: (-(raw[item] - output[item]), item))[:remainder]:
        output[key] += 1
    return {key: output.get(key, 0) for key in weights}


def build_municipal_shards(departments: dict[str, Department]) -> dict[str, Any]:
    by_commune, mayors, exact_keys, loose_keys = load_rne(departments)
    exact, loose, communes_with_t2 = load_candidate_matches(departments, exact_keys, loose_keys)
    populations = load_populations()
    MUNICIPAL_OUTPUT.mkdir(parents=True, exist_ok=True)

    manifest_departments: dict[str, Any] = {}
    for department in departments.values():
        communes: list[dict[str, Any]] = []
        department_nuances: Counter[str] = Counter()
        matched_people = 0
        people_count = 0
        raw_municipal_delegates = 0

        department_communes = [
            (code, members)
            for code, members in by_commune.items()
            if code.startswith(department.code) or (department.code in {"2A", "2B"} and code.startswith(department.code))
        ]
        # RNE's department code is more reliable than a code prefix for COM.
        if department.code in {"973", "977", "978", "986", "987"}:
            geo_codes: set[str] = set()
            geo_path = ROOT / "public" / "data" / "communes" / f"{department.code}.geojson"
            if geo_path.exists():
                geo = json.loads(geo_path.read_text(encoding="utf-8"))
                geo_codes = {str(feature.get("properties", {}).get("code", "")) for feature in geo.get("features", [])}
            department_communes = [(code, members) for code, members in by_commune.items() if code in geo_codes]

        for commune_code, members in sorted(department_communes):
            if not members:
                continue
            mayor = mayors.get(commune_code)
            match_by_person: dict[str, tuple[CandidateMatch | None, str]] = {}
            group_members: dict[str, list[tuple[Councillor, CandidateMatch | None, str]]] = defaultdict(list)
            group_info: dict[str, CandidateMatch] = {}
            for person in members:
                people_count += 1
                match, confidence = choose_match(person, exact, loose, communes_with_t2)
                person_id = stable_id("rne", commune_code, normalize(person.last_name), normalize(person.first_name), person.birth_date)
                match_by_person[person_id] = (match, confidence)
                if match:
                    matched_people += 1
                    group_info[match.group_key] = match
                    group_members[match.group_key].append((person, match, confidence))
                else:
                    group_members["non-classe"].append((person, None, confidence))

            mayor_match: CandidateMatch | None = None
            if mayor:
                mayor_match, _ = choose_match(mayor, exact, loose, communes_with_t2)
            classified_groups = {key: value for key, value in group_members.items() if key != "non-classe"}
            if mayor_match and mayor_match.group_key in classified_groups:
                majority_key = mayor_match.group_key
                majority_basis = "liste-electorale-du-maire"
            elif classified_groups:
                majority_key = max(classified_groups, key=lambda key: len(classified_groups[key]))
                majority_basis = "plus-grand-groupe-electoral-faute-de-rattachement-du-maire"
            else:
                majority_key = "non-classe"
                majority_basis = "affiliation-inconnue"

            population = populations.get(commune_code)
            municipal_delegates = municipal_delegate_count(population, len(members))
            extra_delegates = extra_delegate_count(population)
            raw_municipal_delegates += municipal_delegates + extra_delegates
            designation = "all-councillors" if population is not None and population >= 9_000 else "designation-unknown"

            groups: list[dict[str, Any]] = []
            group_weights: dict[str, int] = {}
            ordered_keys = sorted(
                group_members,
                key=lambda key: (0 if key == majority_key else 2 if key == "non-classe" else 1, -len(group_members[key]), key),
            )
            for group_key in ordered_keys:
                entries = group_members[group_key]
                info = group_info.get(group_key)
                group_nuance = nuance(
                    info.nuance_code if info else "",
                    info.nuance_label if info else "",
                    info.list_name if info else "",
                )
                if group_key == "non-classe":
                    group_name = "Affiliation électorale non retrouvée"
                    group_kind = "unregistered"
                    political_label = "Non classé — ne signifie pas non-inscrit"
                else:
                    raw_list_name = info.list_name or info.list_short or info.nuance_label or "Liste municipale"
                    group_kind = "majority" if group_key == majority_key else "opposition"
                    group_name = f"{'Majorité électorale initiale' if group_kind == 'majority' else 'Opposition électorale'} — {raw_list_name}"
                    political_label = f"{info.nuance_label or info.nuance_code} · {raw_list_name}".strip(" ·")
                electors: list[dict[str, Any]] = []
                for person, person_match, confidence in entries:
                    person_nuance = nuance(
                        person_match.person_code if person_match else "",
                        person_match.nuance_label if person_match else "",
                        person_match.list_name if person_match else "",
                    )
                    is_mayor = bool(
                        mayor
                        and normalize(person.last_name) == normalize(mayor.last_name)
                        and first_token(person.first_name) == first_token(mayor.first_name)
                    )
                    if designation == "all-councillors":
                        role = f"{person.role or 'Conseiller municipal'} · grand électeur de droit"
                    else:
                        role = f"{person.role or 'Conseiller municipal'} · délégation sénatoriale à confirmer"
                    electors.append(
                        {
                            "id": stable_id("rne", commune_code, normalize(person.last_name), normalize(person.first_name), person.birth_date),
                            "name": person.display_name,
                            "role": role,
                            "nuance": person_nuance,
                            "isMayor": is_mayor,
                            "politicalLabel": political_label,
                            "matchConfidence": confidence,
                            "grandElectorStatus": "confirmed" if designation == "all-councillors" else "unknown",
                        }
                    )
                group_id = f"{commune_code}-{group_key}"
                group_weights[group_id] = len(electors)
                groups.append(
                    {
                        "id": group_id,
                        "name": group_name,
                        "nuance": group_nuance,
                        "kind": group_kind,
                        "politicalLabel": political_label,
                        "electors": electors,
                    }
                )

            allocated = largest_remainder(municipal_delegates + extra_delegates, group_weights)
            for group in groups:
                department_nuances[group["nuance"]] += allocated.get(group["id"], 0)

            majority_group = next((group for group in groups if group["kind"] == "majority"), groups[0])
            mayor_name = mayor.display_name if mayor else next(
                (elector["name"] for group in groups for elector in group["electors"] if elector.get("isMayor")),
                "Maire non retrouvé dans le RNE",
            )
            communes.append(
                {
                    "code": commune_code,
                    "name": members[0].commune_name or commune_code,
                    "mayorName": mayor_name,
                    "mayorNuance": majority_group["nuance"],
                    "councilElectors": len(members),
                    "municipalDelegateCount": municipal_delegates,
                    "extraDelegates": extra_delegates,
                    "councilMemberCount": len(members),
                    "population": population,
                    "populationReference": "Population municipale 2023 en vigueur au 1er janvier 2026" if population is not None else None,
                    "delegateSelection": designation,
                    "groups": groups,
                    "dataQuality": "imported",
                    "sourceAsOf": "2026-08-05",
                    "sourceLabel": "RNE au 5 août 2026 + listes municipales des 15 et 22 mars 2026",
                    "sourceUrl": RNE_PAGE,
                    "majorityBasis": majority_basis,
                }
            )

        official_municipal = department.official_municipal_delegates
        if official_municipal is not None and sum(department_nuances.values()) > 0:
            scaled = largest_remainder(official_municipal, dict(department_nuances))
            department_nuances = Counter(scaled)
        if department.official_electors is not None:
            other = max(0, department.official_electors - (official_municipal or 0))
            department_nuances["Divers/SE"] += other

        sources = [
            {"label": "Répertoire national des élus — conseillers municipaux et maires", "url": RNE_PAGE, "asOf": "2026-08-05", "quality": "official"},
            {"label": "Listes candidates municipales — premier tour", "url": CANDIDATES_T1_PAGE, "asOf": "2026-03-13", "quality": "official"},
            {"label": "Listes candidates municipales — second tour", "url": CANDIDATES_T2_PAGE, "asOf": "2026-03-20", "quality": "official"},
            {"label": "Population de référence 2023 en vigueur en 2026", "url": POPULATION_PAGE, "asOf": "2026-01-01", "quality": "official"},
        ]
        shard = {
            "schemaVersion": 1,
            "departmentCode": department.code,
            "datasetRevision": DATASET_REVISION,
            "sources": sources,
            "electorateByNuance": dict(sorted(department_nuances.items())),
            "stats": {
                "communeCount": len(communes),
                "councillorCount": people_count,
                "candidateMatchedCount": matched_people,
                "candidateMatchRate": round(matched_people / people_count, 4) if people_count else 0,
                "derivedMunicipalDelegateCount": raw_municipal_delegates,
                "officialMunicipalDelegateCount": official_municipal,
                "officialElectorCount": department.official_electors,
            },
            "communes": communes,
        }
        target = MUNICIPAL_OUTPUT / f"{department.code}.json"
        target.write_text(json.dumps(shard, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        manifest_departments[department.code] = {
            "communes": len(communes),
            "councillors": people_count,
            "matchRate": shard["stats"]["candidateMatchRate"],
            "bytes": target.stat().st_size,
        }
        log(
            f"{department.code} {department.name}: {len(communes):,} communes, "
            f"{people_count:,} conseillers, {shard['stats']['candidateMatchRate']:.1%} rapprochés"
        )
    return manifest_departments


def api_json(parameters: dict[str, str]) -> dict[str, Any]:
    url = f"{WIKIPEDIA_API}?{urllib.parse.urlencode(parameters)}"
    return json.loads(request_bytes(url, retries=6).decode("utf-8"))


def clean_html_text(element: Any) -> str:
    text = " ".join(" ".join(element.itertext()).split())
    text = re.sub(r"\[[^\]]*\]", "", text)
    return " ".join(text.split()).strip()


def map_wikipedia_title(title: str, departments: dict[str, Department]) -> Department | None:
    normalized_title = normalize(title)
    aliases = {
        "69": ["RHONE", "RHONE ET METROPOLE DE LYON"],
        "987": ["POLYNESIE FRANCAISE"],
        "977": ["SAINT BARTHELEMY"],
        "978": ["SAINT MARTIN"],
        "986": ["WALLIS ET FUTUNA"],
    }
    candidates: list[tuple[int, Department]] = []
    for department in departments.values():
        names = [normalize(department.name), *aliases.get(department.code, [])]
        for name in names:
            if name and name in normalized_title:
                candidates.append((len(name), department))
    return max(candidates, key=lambda entry: entry[0])[1] if candidates else None


def section_nodes(document: Any) -> list[Any]:
    wanted = {"LISTES ET CANDIDATS", "CANDIDATS", "CANDIDATURES"}
    for heading in document.xpath("//h2"):
        heading_text = normalize(clean_html_text(heading))
        if not any(heading_text.startswith(candidate) for candidate in wanted):
            continue
        nodes: list[Any] = []
        container = heading.getparent()
        if container is None or "mw-heading2" not in (container.get("class") or ""):
            container = heading
        current = container.getnext()
        while current is not None:
            if "mw-heading2" in (current.get("class") or "") or current.xpath("./h2"):
                break
            nodes.append(current)
            current = current.getnext()
        return nodes
    return []


def candidate_rows(table: Any) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for row in table.xpath(".//tr"):
        cells = row.xpath("./th|./td")
        if not row.xpath("./td") or not cells:
            continue
        texts = [clean_html_text(cell) for cell in cells]
        if len(texts) < 2:
            continue
        marker = texts[0]
        marker_norm = normalize(marker)
        if re.fullmatch(r"(?:0?\d+|T|S|TITULAIRE|SUPPLEANT|REMPLACANT)(?:\s+.*)?", marker_norm):
            name_index = next((index for index in range(1, len(texts)) if texts[index]), 1)
        else:
            name_index = next((index for index, value in enumerate(texts) if value), 0)
            marker = ""
        name = texts[name_index].strip(" ·–—")
        if not name or normalize(name) in {"CANDIDATS", "CANDIDAT", "NOM"}:
            continue
        trailing = [value for value in texts[name_index + 1 :] if value]
        party = trailing[0] if trailing else ""
        functions = trailing[1] if len(trailing) > 1 else ""
        rank_match = re.search(r"\d+", texts[0])
        output.append(
            {
                "marker": marker,
                "rank": int(rank_match.group()) if rank_match else None,
                "name": name,
                "party": party,
                "functions": functions,
            }
        )
    return output


def wikipedia_url(title: str) -> str:
    return f"https://fr.wikipedia.org/wiki/{urllib.parse.quote(title.replace(' ', '_'))}"


def list_id(department_code: str, name: str, head: str) -> str:
    return f"wiki-{department_code}-{slug(name)[:36]}-{hashlib.sha1(head.encode('utf-8')).hexdigest()[:7]}"


def make_member(list_identifier: str, row: dict[str, Any], position: int) -> dict[str, Any]:
    member_nuance = nuance("", row.get("party", ""))
    return {
        "id": f"{list_identifier}-candidate-{position}",
        "name": row["name"],
        "nuance": member_nuance,
        "position": position,
        "politicalLabel": row.get("party") or None,
        "functions": row.get("functions") or None,
    }


def extract_wikipedia_offers(
    title: str,
    department: Department,
    parse: dict[str, Any],
) -> list[dict[str, Any]]:
    if html is None:
        raise RuntimeError("lxml est requis pour extraire les tableaux Wikipédia")
    document = html.fromstring(parse["text"])
    nodes = section_nodes(document)
    if not nodes:
        return []
    source_url = wikipedia_url(title)
    revision = parse.get("revid")
    offers: list[dict[str, Any]] = []
    heading_raw = ""
    last_list_label = ""

    if department.method == "majority":
        all_rows: list[dict[str, Any]] = []
        for node in nodes:
            if str(node.tag).lower() == "table":
                all_rows.extend(candidate_rows(node))
        current: dict[str, Any] | None = None
        for row in all_rows:
            marker = normalize(row.get("marker", ""))
            is_substitute = marker.startswith("S") or "SUPPLEANT" in marker or "REMPLACANT" in marker
            if is_substitute and current is not None:
                current["members"].append(make_member(current["id"], row, len(current["members"]) + 1))
                continue
            ticket_nuance = nuance("", row.get("party", ""))
            identifier = list_id(department.code, f"Candidature {row['name']}", row["name"])
            current = {
                "id": identifier,
                "name": f"Candidature {row['name']}",
                "shortName": row["name"],
                "nuance": ticket_nuance,
                "head": row["name"],
                "members": [make_member(identifier, row, 1)],
                "status": "announced",
                "sourceUrl": source_url,
                "sourceLabel": "Wikipédia — annonce provisoire",
                "sourceAsOf": RETRIEVED_DATE,
                "sourceRevision": revision,
            }
            offers.append(current)
        return offers

    for node in nodes:
        tag = str(node.tag).lower()
        h3 = node.xpath("./h3")
        if tag == "h3" or h3:
            heading_raw = clean_html_text(h3[0] if h3 else node)
            last_list_label = ""
            continue
        if tag == "p":
            paragraph = clean_html_text(node)
            if normalize(paragraph).startswith("LISTE") and len(paragraph) < 180:
                last_list_label = re.sub(r"^Liste\s*", "", paragraph, flags=re.IGNORECASE).strip(" :—–")
            continue
        if tag != "table":
            continue
        rows = candidate_rows(node)
        if not rows:
            continue
        captions = node.xpath("./caption")
        caption = clean_html_text(captions[0]) if captions else ""
        label = caption or last_list_label or heading_raw or f"Liste menée par {rows[0]['name']}"
        label = re.sub(r"^Liste\s*", "", label, flags=re.IGNORECASE).strip(" :—–") or heading_raw
        head = rows[0]["name"]
        offer_nuance = nuance("", heading_raw, rows[0].get("party", ""), label)
        identifier = list_id(department.code, label, head)
        members = [make_member(identifier, row, index + 1) for index, row in enumerate(rows)]
        offers.append(
            {
                "id": identifier,
                "name": label,
                "shortName": " ".join(label.split()[:4]),
                "nuance": offer_nuance,
                "head": head,
                "members": members,
                "status": "announced",
                "sourceUrl": source_url,
                "sourceLabel": "Wikipédia — annonce provisoire",
                "sourceAsOf": RETRIEVED_DATE,
                "sourceRevision": revision,
                "politicalLabel": heading_raw or rows[0].get("party") or None,
            }
        )
    deduplicated: dict[tuple[str, str], dict[str, Any]] = {}
    for offer in offers:
        deduplicated[(normalize(offer["name"]), normalize(offer["head"]))] = offer
    return list(deduplicated.values())


def prose_fallbacks() -> dict[str, list[dict[str, Any]]]:
    values = {
        "89": [
            ("Pascal Blaise", "RN", "Marine Vigne"),
        ],
        "73": [
            ("Guillaume Desrues", "PS", None),
            ("Gwenaëlle Hergott", "LFI", "Daniel Ibanez"),
        ],
    }
    titles = {
        "89": "Élections sénatoriales de 2026 dans l'Yonne",
        "73": "Élections sénatoriales de 2026 en Savoie",
    }
    output: dict[str, list[dict[str, Any]]] = {}
    for code, candidates in values.items():
        offers: list[dict[str, Any]] = []
        for head, raw_nuance, substitute in candidates:
            identifier = list_id(code, f"Candidature {head}", head)
            members = [
                {"id": f"{identifier}-candidate-1", "name": head, "nuance": raw_nuance, "position": 1}
            ]
            if substitute:
                members.append(
                    {"id": f"{identifier}-candidate-2", "name": substitute, "nuance": raw_nuance, "position": 2}
                )
            offers.append(
                {
                    "id": identifier,
                    "name": f"Candidature {head}",
                    "shortName": head,
                    "nuance": raw_nuance,
                    "head": head,
                    "members": members,
                    "status": "announced",
                    "sourceUrl": wikipedia_url(titles[code]),
                    "sourceLabel": "Wikipédia — annonce en prose, provisoire",
                    "sourceAsOf": RETRIEVED_DATE,
                }
            )
        output[code] = offers
    return output


def build_wikipedia_lists(departments: dict[str, Department]) -> dict[str, Any]:
    cache_directory = SOURCE_DIR / "wikipedia"
    cache_directory.mkdir(parents=True, exist_ok=True)
    index_cache = cache_directory / "allpages.json"
    if index_cache.exists():
        query = json.loads(index_cache.read_text(encoding="utf-8"))
    else:
        query = api_json(
            {
                "action": "query",
                "list": "allpages",
                "apprefix": "Élections sénatoriales de 2026",
                "apnamespace": "0",
                "aplimit": "500",
                "format": "json",
                "formatversion": "2",
            }
        )
        index_cache.write_text(json.dumps(query, ensure_ascii=False), encoding="utf-8")
    pages = query.get("query", {}).get("allpages", [])
    by_department: dict[str, Any] = {}
    for page in pages:
        title = page.get("title", "")
        if title == "Élections sénatoriales de 2026" or "françaises de 2026" in title.lower():
            continue
        department = map_wikipedia_title(title, departments)
        if department is None:
            continue
        cache_path = cache_directory / f"{stable_id('page', title)}.json"
        if cache_path.exists():
            response = json.loads(cache_path.read_text(encoding="utf-8"))
        else:
            response = api_json(
                {
                    "action": "parse",
                    "page": title,
                    "prop": "text|revid|displaytitle",
                    "format": "json",
                    "formatversion": "2",
                    "maxlag": "5",
                }
            )
            cache_path.write_text(json.dumps(response, ensure_ascii=False), encoding="utf-8")
            time.sleep(0.8)
        parse = response.get("parse")
        if not parse:
            continue
        offers = extract_wikipedia_offers(title, department, parse)
        entry = {
            "departmentCode": department.code,
            "departmentName": department.name,
            "method": department.method,
            "sourceUrl": wikipedia_url(title),
            "sourceAsOf": RETRIEVED_DATE,
            "sourceRevision": parse.get("revid"),
            "lists": offers,
        }
        current = by_department.get(department.code)
        if current is None or len(offers) > len(current["lists"]):
            by_department[department.code] = entry
        log(f"Wikipédia {department.code} {department.name}: {len(offers)} offre(s) structurée(s)")

    for code, offers in prose_fallbacks().items():
        if code not in by_department:
            department = departments[code]
            by_department[code] = {
                "departmentCode": code,
                "departmentName": department.name,
                "method": department.method,
                "sourceUrl": offers[0]["sourceUrl"],
                "sourceAsOf": RETRIEVED_DATE,
                "sourceRevision": None,
                "lists": [],
            }
        existing_heads = {normalize(item["head"]) for item in by_department[code]["lists"]}
        by_department[code]["lists"].extend(item for item in offers if normalize(item["head"]) not in existing_heads)

    catalogue = {
        "schemaVersion": 1,
        "retrievedAt": f"{RETRIEVED_DATE}T00:00:00+02:00",
        "provider": "Wikipédia francophone",
        "warning": "Ébauches non officielles susceptibles de changer jusqu'au dépôt des candidatures.",
        "departments": dict(sorted(by_department.items())),
    }
    LISTS_OUTPUT.write_text(json.dumps(catalogue, ensure_ascii=False, indent=2), encoding="utf-8")
    total_offers = sum(len(entry["lists"]) for entry in by_department.values())
    log(f"Catalogue Wikipédia: {len(by_department)} territoires, {total_offers} offres")
    return {"territories": len(by_department), "offers": total_offers}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-download", action="store_true")
    parser.add_argument("--force-download", action="store_true")
    parser.add_argument("--municipal-only", action="store_true")
    parser.add_argument("--wikipedia-only", action="store_true")
    args = parser.parse_args()
    if args.municipal_only and args.wikipedia_only:
        parser.error("--municipal-only et --wikipedia-only sont incompatibles")

    departments = read_departments()
    existing_manifest: dict[str, Any] = {}
    if MANIFEST_OUTPUT.exists():
        try:
            existing_manifest = json.loads(MANIFEST_OUTPUT.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            existing_manifest = {}
    manifest_departments: dict[str, Any] = dict(existing_manifest.get("municipal", {}))
    wikipedia_stats: dict[str, Any] = dict(existing_manifest.get("senatorialLists", {}))
    if not args.wikipedia_only:
        if not args.skip_download:
            download_inputs(force=args.force_download)
        manifest_departments = build_municipal_shards(departments)
    if not args.municipal_only:
        wikipedia_stats = build_wikipedia_lists(departments)

    manifest = {
        "schemaVersion": 1,
        "datasetRevision": DATASET_REVISION,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "municipal": manifest_departments,
        "senatorialLists": wikipedia_stats,
    }
    MANIFEST_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_OUTPUT.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
