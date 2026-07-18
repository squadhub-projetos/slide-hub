import { useUiStore } from '../state/uiStore'
import { Modal } from './Modal'

/** Diálogo de confirmação global — substitui window.confirm(). */
export function ConfirmDialog() {
  const confirm = useUiStore((s) => s.confirm)
  const close = useUiStore((s) => s.closeConfirm)

  return (
    <Modal
      open={confirm !== null}
      title={confirm?.title ?? ''}
      onClose={close}
      width={440}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={close}>
            Cancelar
          </button>
          <button
            type="button"
            className={`btn ${confirm?.danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => {
              confirm?.onConfirm()
              close()
            }}
          >
            {confirm?.confirmLabel ?? 'Confirmar'}
          </button>
        </>
      }
    >
      <p className="text-soft" style={{ fontSize: 14 }}>
        {confirm?.message}
      </p>
    </Modal>
  )
}
