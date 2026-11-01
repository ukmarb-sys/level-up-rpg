interface Props {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** A small modal confirmation (used for test-mode actions). */
export function ConfirmDialog({ title, body, confirmLabel, danger, onConfirm, onCancel }: Props) {
  return (
    <div className="confirm-backdrop" onClick={(e) => e.stopPropagation()}>
      <div className="confirm" role="alertdialog" aria-modal="true" aria-label={title}>
        <h3>{title}</h3>
        <p>{body}</p>
        <div className="confirm__actions">
          <button className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
