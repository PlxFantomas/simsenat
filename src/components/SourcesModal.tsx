import { ExternalLink, ShieldCheck, X } from 'lucide-react'
import { SOURCE_LINKS } from '../data/election2026'
import { useDialogFocus } from '../lib/dialog'

interface SourcesModalProps {
  onClose: () => void
}

const sourceRows = [
  {
    title: 'Périmètre, sièges et règles',
    status: 'Officiel',
    detail: 'Série 2, 178 sièges, scrutin proportionnel dès trois sièges.',
    href: SOURCE_LINKS.senate2026,
    label: 'Sénat · élections 2026',
  },
  {
    title: 'Contours administratifs',
    status: 'Référentiel ouvert',
    detail: 'Contours GeoJSON, millésime 2026, généralisation 1 000 m.',
    href: SOURCE_LINKS.geoData,
    label: 'data.gouv.fr',
  },
  {
    title: 'Totaux des collèges électoraux',
    status: 'Officiel provisoire',
    detail: 'Recensement du Sénat au 23 juin 2026, sous réserve des contentieux et nouvelles désignations.',
    href: 'https://www.senat.fr/fileadmin/cru-1783325159/Presse/Dossiers_de_presse/Senatoriales_2026_dossier_presse.pdf',
    label: 'Dossier de presse du Sénat',
  },
  {
    title: 'Conseils municipaux et groupes',
    status: 'Officiel + dérivé',
    detail: 'Noms et fonctions : RNE au 5 août 2026. La majorité électorale initiale et les oppositions sont reconstruites depuis les listes municipales ; elles ne décrivent pas forcément les groupes actuels.',
    href: 'https://www.data.gouv.fr/datasets/repertoire-national-des-elus-1',
    label: 'Répertoire national des élus',
  },
  {
    title: 'Listes sénatoriales',
    status: 'Annonces non officielles',
    detail: 'Ébauches et compositions relevées sur les pages départementales de Wikipédia au 15 août 2026. Chaque carte conserve sa page source et sa révision ; le dépôt officiel est prévu du 7 au 11 septembre.',
    href: 'https://fr.wikipedia.org/wiki/Élections_sénatoriales_françaises_de_2026',
    label: 'Wikipédia · scrutin 2026',
  },
  {
    title: 'Désignation des grands électeurs communaux',
    status: 'Partiellement disponible',
    detail: 'Sous 9 000 habitants, le RNE ne dit pas quels conseillers ont été désignés. Au-delà de 30 000 habitants, le volume des délégués supplémentaires est calculé depuis la population Insee ; les noms exigent les tableaux préfectoraux.',
    href: 'https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006070239/LEGISCTA000006115457/2026-05-03',
    label: 'Code électoral · L. 284 et L. 285',
  },
]

export function SourcesModal({ onClose }: SourcesModalProps) {
  const dialogRef = useDialogFocus<HTMLElement>(onClose)
  return (
    <div className="modal-layer">
      <button className="modal-backdrop" type="button" aria-label="Fermer" onClick={onClose} />
      <section ref={dialogRef} className="sources-modal" role="dialog" aria-modal="true" aria-labelledby="sources-title">
        <header>
          <div className="modal-icon"><ShieldCheck size={20} /></div>
          <div><p className="eyebrow">Transparence</p><h2 id="sources-title">Sources & niveau de qualité</h2><p>État des données au 15 août 2026.</p></div>
          <button className="close-button" type="button" onClick={onClose} aria-label="Fermer"><X size={20} /></button>
        </header>
        <div className="source-list">
          {sourceRows.map((source) => (
            <article key={source.title}>
              <div><h3>{source.title}</h3><span className={`quality-tag ${source.status.includes('non officielle') || source.status.includes('provisoire') || source.status.includes('Partiellement') || source.status.includes('dérivé') ? 'warning' : ''}`}>{source.status}</span></div>
              <p>{source.detail}</p>
              <a href={source.href} target="_blank" rel="noreferrer">{source.label} <ExternalLink size={13} /></a>
            </article>
          ))}
        </div>
        <div className="privacy-note"><strong>Confidentialité</strong><p>Les hypothèses de vote restent dans ce navigateur. Elles ne constituent ni une donnée réelle ni une prédiction sur les personnes.</p></div>
        <footer><button className="primary-button" type="button" onClick={onClose}>J’ai compris</button></footer>
      </section>
    </div>
  )
}
