import Icon from "./icon";

/** What a person sees after a public form is sent: a short confirmation in place of the form. */
export default function FormConfirmation({ title, message, onClose, closeLabel = "Close" }: { title: string; message: string; onClose?: () => void; closeLabel?: string }) {
  return <div className="form-confirmation" role="status" aria-live="polite">
    <span className="form-confirmation-icon"><Icon name="check_circle" /></span>
    <h3>{title}</h3>
    <p>{message}</p>
    {onClose && <button type="button" className="button button-quiet" onClick={onClose}>{closeLabel}</button>}
  </div>;
}
