import { Scale, ShieldCheck, X } from 'lucide-react'
import { useDialogFocus } from '../lib/dialog'

export type LegalPage = 'legal' | 'privacy'

interface LegalModalProps {
  page: LegalPage
  onChangePage: (page: LegalPage) => void
  onClose: () => void
}

export function LegalModal({ page, onChangePage, onClose }: LegalModalProps) {
  const dialogRef = useDialogFocus<HTMLElement>(onClose)
  const isLegal = page === 'legal'

  return (
    <div className="modal-layer">
      <button className="modal-backdrop" type="button" aria-label="Fermer" onClick={onClose} />
      <section
        ref={dialogRef}
        className="legal-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-title"
      >
        <header>
          <div className="modal-icon">
            {isLegal ? <Scale size={20} /> : <ShieldCheck size={20} />}
          </div>
          <div>
            <p className="eyebrow">Informations</p>
            <h2 id="legal-title">{isLegal ? 'Mentions légales' : 'Politique de confidentialité'}</h2>
          </div>
          <button className="close-button" type="button" onClick={onClose} aria-label="Fermer">
            <X size={20} />
          </button>
        </header>

        <nav className="legal-tabs" aria-label="Informations légales">
          <button
            type="button"
            className={isLegal ? 'active' : ''}
            aria-current={isLegal ? 'page' : undefined}
            onClick={() => onChangePage('legal')}
          >
            Mentions légales
          </button>
          <button
            type="button"
            className={!isLegal ? 'active' : ''}
            aria-current={!isLegal ? 'page' : undefined}
            onClick={() => onChangePage('privacy')}
          >
            Confidentialité
          </button>
        </nav>

        {isLegal ? (
          <div className="legal-content">
            <section>
              <h3>Édition du site</h3>
              <p>Ce simulateur est développé et édité par <strong>Edgar Cherrier</strong>, responsable de la publication.</p>
            </section>
            <section>
              <h3>Hébergement</h3>
              <p>Le site est hébergé par <strong>Netlify</strong>.</p>
            </section>
            <section>
              <h3>Nature du service</h3>
              <p>Ce simulateur est un outil indépendant, fourni à titre informatif. Il ne constitue pas un service officiel de l’administration française.</p>
            </section>
          </div>
        ) : (
          <div className="legal-content">
            <section>
              <h3>Aucune collecte de données</h3>
              <p>Aucune donnée personnelle n’est collectée, transmise ou stockée par l’éditeur. Le site ne nécessite aucun compte et n’utilise aucun outil de suivi ou de mesure d’audience.</p>
            </section>
            <section>
              <h3>Scénarios enregistrés localement</h3>
              <p>Les projections saisies sont conservées uniquement dans le stockage local de votre navigateur afin de retrouver votre travail. Elles ne quittent pas votre appareil et peuvent être supprimées en réinitialisant la projection ou les données du site dans votre navigateur.</p>
            </section>
          </div>
        )}

        <footer>
          <button className="primary-button" type="button" onClick={onClose}>Fermer</button>
        </footer>
      </section>
    </div>
  )
}
