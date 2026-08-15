# Simulateur des sénatoriales 2026

Application locale React/TypeScript pour simuler le renouvellement de la série 2 du Sénat le 27 septembre 2026.

## Lancer le projet sous Windows

Dans PowerShell, placez-vous dans le dossier du projet puis utilisez les exécutables `.cmd` de npm. Cette forme contourne le blocage de `npm.ps1` sans modifier la politique de sécurité de Windows :

```powershell
cd "C:\Users\Utilisateur\Documents\ChatGPT\Simulateur élection sénatoriales"
npm.cmd install
npm.cmd run dev
```

Laissez PowerShell ouvert et ouvrez l’adresse indiquée par Vite, normalement [http://localhost:5173](http://localhost:5173). Il ne faut pas ouvrir `index.html` directement avec une adresse `file:///…`.

Pour tester et construire l’application :

```powershell
npm.cmd test
npm.cmd run build
```

## Fonctionnalités

- carte nationale distinguant les départements renouvelés et non renouvelés ;
- carte GeoJSON des communes pour chacun des 63 territoires cartographiés ;
- sélection d’une liste ou candidature, puis affectation individuelle ou par groupe municipal ;
- présélection départementale par nuance et pourcentage, ajustable commune par commune ;
- saisie agrégée des voix des délégués supplémentaires ;
- coloration d’une commune selon la liste qui y domine ;
- calcul instantané des sièges à la plus forte moyenne ;
- projection majoritaire explicite du tour décisif, avec vote nominatif et panachage jusqu’à deux candidatures ;
- protection contre le double comptage : un ajustement communal remplace la présélection départementale correspondante ;
- ajout de listes de travail, sauvegarde locale et export agrégé ;
- navigation clavier, libellés accessibles et interface responsive.

## Données intégrées au 15 août 2026

Les fiches communales sont générées à partir du [Répertoire national des élus](https://www.data.gouv.fr/datasets/repertoire-national-des-elus-1), actualisé après les municipales de mars 2026. Les élus sont rapprochés des fichiers officiels de candidatures des [premier](https://www.data.gouv.fr/datasets/elections-municipales-2026-listes-candidates-au-premier-tour) et [second](https://www.data.gouv.fr/datasets/elections-municipales-2026-listes-candidates-au-second-tour) tours pour reconstituer les listes électorales initiales.

Les ébauches de candidatures sénatoriales sont relevées sur les pages départementales de [Wikipédia](https://fr.wikipedia.org/wiki/Élections_sénatoriales_françaises_de_2026). Elles sont affichées comme annonces non officielles, datées et reliées à leur page source. Elles peuvent être incomplètes ou évoluer jusqu’au dépôt officiel des candidatures du 7 au 11 septembre 2026.

Le périmètre de la série 2, les 178 sièges, le mode de scrutin et les totaux des collèges électoraux recensés au 23 juin proviennent du Sénat et du code électoral. Les populations communales utilisées pour estimer les délégués supplémentaires sont les populations de référence 2023 de l’Insee, en vigueur en 2026.

### Limites à conserver à l’esprit

- Le RNE fournit les conseillers et leurs fonctions, mais pas les groupes municipaux actuels. Les rubriques « majorité » et « opposition » représentent donc les listes électorales initiales de mars 2026, pas nécessairement les groupes en vigueur aujourd’hui.
- Dans les communes de moins de 9 000 habitants, le fichier national ne permet pas d’identifier quels conseillers ont été effectivement désignés grands électeurs. Le simulateur présente les noms comme hypothèses à sélectionner ; les tableaux préfectoraux restent la source décisive.
- Une affiliation non retrouvée lors du rapprochement n’est jamais assimilée automatiquement à « non-inscrit » : elle est affichée comme non classée.
- Les affectations saisies sont des hypothèses de simulation et ne doivent pas être présentées comme des intentions de vote réelles.

## Régénérer les données

Le pipeline reproductible se trouve dans `scripts/build-election-data.py`. Il produit un fichier municipal chargé à la demande pour chaque département ainsi que le catalogue des annonces sénatoriales.

```powershell
python scripts\build-election-data.py
```

Les téléchargements sources sont mis en cache dans `scripts/data-source/`, répertoire ignoré par Git.

## Sources principales

- [Site officiel des sénatoriales 2026](https://senatoriales2026.senat.fr/)
- [Résultats officiels des municipales 2026](https://www.resultats-elections.interieur.gouv.fr/municipales2026/)
- [Répertoire national des élus](https://www.data.gouv.fr/datasets/repertoire-national-des-elus-1)
- [Populations de référence 2023 — Insee](https://www.insee.fr/fr/statistiques/8681011)
- [Nombre de sénateurs par département — Code électoral](https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006070239/LEGISCTA000006134805/2026-04-30)
- [Dossier de presse du Sénat — collèges électoraux](https://www.senat.fr/fileadmin/cru-1783325159/Presse/Dossiers_de_presse/Senatoriales_2026_dossier_presse.pdf)
- [Contours administratifs — data.gouv.fr](https://www.data.gouv.fr/datasets/contours-administratifs)

## Confidentialité

Les scénarios sont stockés dans `localStorage`. Aucun serveur applicatif, outil d’analyse ou envoi de données nominatives n’est utilisé.
