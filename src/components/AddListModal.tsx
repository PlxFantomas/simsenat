import { useState, type FormEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { NUANCE_COLORS, NUANCES, type Nuance, type VotingMethod } from '../data/election2026'
import type { SimulationList } from '../data/demo'
import { useDialogFocus } from '../lib/dialog'

interface AddListModalProps {
  method: VotingMethod
  onAdd: (list: SimulationList) => void
  onClose: () => void
}

export function AddListModal({ method, onAdd, onClose }: AddListModalProps) {
  const [name, setName] = useState('')
  const [head, setHead] = useState('')
  const [nuance, setNuance] = useState<Nuance>('Divers/SE')
  const dialogRef = useDialogFocus<HTMLFormElement>(onClose)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) return
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    onAdd({
      id,
      name: trimmedName,
      shortName: trimmedName.split(' ').slice(0, 2).join(' '),
      nuance,
      head: head.trim() || 'Tête de liste à renseigner',
      status: 'working',
      custom: true,
      members: [{ id: `${id}-candidate-1`, name: head.trim() || 'Tête de liste à renseigner', nuance, position: 1 }],
    })
  }

  return (
    <div className="modal-layer">
      <button className="modal-backdrop" type="button" aria-label="Fermer" onClick={onClose} />
      <form ref={dialogRef} className="add-list-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="add-list-title">
        <header><div><p className="eyebrow">Scénario</p><h2 id="add-list-title">Ajouter {method === 'majority' ? 'une candidature' : 'une liste'}</h2></div><button className="close-button" type="button" onClick={onClose} aria-label="Fermer"><X size={20} /></button></header>
        <label><span>{method === 'majority' ? 'Nom de la candidature' : 'Nom de la liste'}</span><input autoFocus required value={name} onChange={(event) => setName(event.target.value)} placeholder={method === 'majority' ? 'Ex. Candidature territoriale' : 'Ex. La voix de nos communes'} /></label>
        <label><span>{method === 'majority' ? 'Candidat' : 'Tête de liste'}</span><input value={head} onChange={(event) => setHead(event.target.value)} placeholder="Nom à renseigner" /></label>
        <label><span>Nuance</span><select value={nuance} onChange={(event) => setNuance(event.target.value as Nuance)}>{NUANCES.map((item) => <option key={item}>{item}</option>)}</select></label>
        <div className="nuance-preview"><i style={{ background: NUANCE_COLORS[nuance] }} /><span>{nuance}</span></div>
        <footer><button type="button" className="secondary-button" onClick={onClose}>Annuler</button><button type="submit" className="primary-button"><Plus size={16} /> Ajouter</button></footer>
      </form>
    </div>
  )
}
