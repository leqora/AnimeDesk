import { useRef } from 'react'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { Modal } from './Modal.jsx'

export function AskDialog({ ask, onDone }) {
  const api = useApi()
  const t = useT()
  const yesRef = useRef(null)
  const yes = async () => {
    await api.library.recordWatched({ aniCliTitle: ask.aniCliTitle, episode: ask.episode })
    onDone()
  }
  const question = t('ask.markWatched', { episode: ask.episode, title: ask.aniCliTitle })
  return (
    <Modal label={question} onClose={onDone} initialFocus={yesRef}>
      <p>{question}</p>
      <div className="row">
        <button type="button" className="primary" ref={yesRef} onClick={yes}>{t('ask.yes')}</button>
        <button type="button" onClick={onDone}>{t('ask.no')}</button>
      </div>
    </Modal>
  )
}
