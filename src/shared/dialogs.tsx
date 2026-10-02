import { useEffect, useEffectEvent, useId, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './controls';
import styles from './shared.module.css';

export interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  initialFocus?: RefObject<HTMLElement | null>;
  role?: 'dialog' | 'alertdialog';
}

const inertOwnership = new WeakMap<
  Element,
  { owners: number; originalAttribute: string | null }
>();

function focusableElements(panel: HTMLElement) {
  return Array.from(
    panel.querySelectorAll<HTMLElement>(
      'button, a[href], input, select, textarea, [tabindex]',
    ),
  ).filter((element) => {
    if (
      element.tabIndex < 0 ||
      element.matches(':disabled') ||
      element.closest('[hidden], [inert], [aria-hidden="true"]')
    )
      return false;
    for (
      let ancestor: HTMLElement | null = element;
      ancestor && panel.contains(ancestor);
      ancestor = ancestor.parentElement
    ) {
      const style = getComputedStyle(ancestor);
      if (style.display === 'none' || style.visibility === 'hidden')
        return false;
    }
    return true;
  });
}

function DialogContent({
  title,
  description,
  children,
  onClose,
  initialFocus,
  role = 'dialog',
}: Omit<DialogProps, 'open'>) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const close = useEffectEvent(onClose);

  useEffect(() => {
    const panel = panelRef.current;
    const overlay = overlayRef.current;
    if (!panel || !overlay) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const background = Array.from(document.body.children).filter(
      (element) => element !== overlay,
    );
    const releaseBackground = background.map((element) => {
      const ownership = inertOwnership.get(element) ?? {
        owners: 0,
        originalAttribute: element.getAttribute('inert'),
      };
      ownership.owners += 1;
      inertOwnership.set(element, ownership);
      element.setAttribute('inert', '');
      return () => {
        ownership.owners -= 1;
        if (ownership.owners === 0) {
          if (ownership.originalAttribute === null)
            element.removeAttribute('inert');
          else element.setAttribute('inert', ownership.originalAttribute);
          inertOwnership.delete(element);
        }
      };
    });

    const focusFirst = () => (focusableElements(panel)[0] ?? panel).focus();
    const isTopDialog = () =>
      Array.from(document.querySelectorAll('[data-shared-dialog]')).at(-1) ===
      panel;
    if (initialFocus?.current && panel.contains(initialFocus.current))
      initialFocus.current.focus();
    if (!panel.contains(document.activeElement)) focusFirst();

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopDialog()) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        const elements = focusableElements(panel);
        const index = elements.findIndex(
          (element) => element === document.activeElement,
        );
        const next = event.shiftKey
          ? index <= 0
            ? elements.length - 1
            : index - 1
          : (index + 1) % elements.length;
        (elements[next] ?? panel).focus();
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      if (
        isTopDialog() &&
        event.target instanceof Node &&
        !panel.contains(event.target)
      )
        focusFirst();
    };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('focusin', onFocusIn);
      releaseBackground.forEach((release) => release());
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [initialFocus]);

  return createPortal(
    <div className={styles.overlay} ref={overlayRef}>
      <div
        ref={panelRef}
        data-shared-dialog
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={styles.dialog}
      >
        <h2 id={titleId}>{title}</h2>
        {description && <p id={descriptionId}>{description}</p>}
        {children}
        <div className={styles.dialogClose}>
          <Button variant="secondary" onClick={onClose}>
            Close dialog
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function Dialog({ open, ...props }: DialogProps) {
  return open ? <DialogContent {...props} /> : null;
}

export interface ConfirmationDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open={open}
      title={title}
      description={description}
      role="alertdialog"
      onClose={onCancel}
      initialFocus={cancelRef}
    >
      <div className={styles.dialogActions}>
        <Button ref={cancelRef} variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant="danger" disabled={confirmDisabled} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
