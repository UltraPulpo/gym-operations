import { StrictMode, useRef, useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button, ConfirmationDialog, Dialog, InputField } from './index';

function DialogExample({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open details</Button>
      <Button>Outside action</Button>
      <Dialog
        open={open}
        title="Edit details"
        description="Changes are local only."
        onClose={() => {
          onClose();
          setOpen(false);
        }}
      >
        <InputField label="Name" />
        <Button disabled>Disabled action</Button>
        <Button hidden>Hidden action</Button>
        <Button>Save details</Button>
      </Dialog>
    </>
  );
}

function NestedDialogExample({ showParent = true }: { showParent?: boolean }) {
  const [childOpen, setChildOpen] = useState(false);
  return (
    <>
      <Button>Outside action</Button>
      {showParent && (
        <Dialog open title="Parent" onClose={() => {}}>
          <Button onClick={() => setChildOpen(true)}>Open child</Button>
        </Dialog>
      )}
      <Dialog
        open={childOpen}
        title="Child"
        onClose={() => setChildOpen(false)}
      >
        <Button>Child action</Button>
      </Dialog>
    </>
  );
}

describe('shared dialogs', () => {
  it('is absent when closed, has a name/description when opened, and focuses the first usable control', async () => {
    const user = userEvent.setup();
    render(<DialogExample />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open details' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit details' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('Changes are local only.');
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveFocus();
  });

  it('wraps Tab and Shift+Tab, skips disabled/hidden controls, and prevents outside focus', async () => {
    const user = userEvent.setup();
    render(<DialogExample />);
    await user.click(screen.getByRole('button', { name: 'Open details' }));
    await user.tab();
    expect(screen.getByRole('button', { name: 'Save details' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus();
    screen
      .getByRole('button', { name: 'Outside action', hidden: true })
      .focus();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
  });

  it('closes with Escape and restores trigger focus and background interactivity', async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    const { container } = render(
      <StrictMode>
        <DialogExample onClose={close} />
      </StrictMode>,
    );
    const trigger = screen.getByRole('button', { name: 'Open details' });
    await user.click(trigger);
    expect(container).toHaveAttribute('inert');
    await user.keyboard('{Escape}');
    expect(close).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(container).not.toHaveAttribute('inert');
  });

  it('closes by an explicit keyboard button without confirming anything', async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    render(<DialogExample onClose={close} />);
    await user.click(screen.getByRole('button', { name: 'Open details' }));
    screen.getByRole('button', { name: 'Close dialog' }).focus();
    await user.keyboard('{Enter}');
    expect(close).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('supports caller-selected initial focus and does not reset focus on content rerender', async () => {
    const user = userEvent.setup();
    function Example() {
      const initialFocus = useRef<HTMLInputElement>(null);
      const [count, setCount] = useState(0);
      return (
        <Dialog
          open
          title="Editable dialog"
          onClose={() => {}}
          initialFocus={initialFocus}
        >
          <input aria-label="Initial field" ref={initialFocus} />
          <Button onClick={() => setCount(count + 1)}>Increment {count}</Button>
        </Dialog>
      );
    }
    render(<Example />);
    expect(
      screen.getByRole('textbox', { name: 'Initial field' }),
    ).toHaveFocus();
    await user.tab();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Increment 1' })).toHaveFocus();
  });

  it('defaults confirmation focus to cancel and confirms only an explicit activation', async () => {
    const user = userEvent.setup();
    const confirm = vi.fn();
    const cancel = vi.fn();
    function Example() {
      const [open, setOpen] = useState(true);
      return (
        <ConfirmationDialog
          open={open}
          title="Discard changes?"
          description="Unsaved local changes will be lost."
          confirmLabel="Discard changes"
          onConfirm={() => {
            confirm();
            setOpen(false);
          }}
          onCancel={() => {
            cancel();
            setOpen(false);
          }}
        />
      );
    }
    const { unmount } = render(<Example />);
    expect(
      screen.getByRole('alertdialog', { name: 'Discard changes?' }),
    ).toHaveAccessibleDescription('Unsaved local changes will be lost.');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
    unmount();
    render(<Example />);
    await user.tab();
    await user.keyboard(' ');
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('cancels confirmation on Escape and supports a disabled pending confirmation', async () => {
    const user = userEvent.setup();
    const confirm = vi.fn();
    const cancel = vi.fn();
    render(
      <ConfirmationDialog
        open
        title="Confirm action?"
        description="Review before proceeding."
        confirmLabel="Proceed"
        confirmDisabled
        onConfirm={confirm}
        onCancel={cancel}
      />,
    );
    expect(screen.getByRole('button', { name: 'Proceed' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Proceed' }));
    await user.keyboard('{Escape}');
    expect(confirm).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('preserves preexisting background inert attributes after unmount', () => {
    const background = document.createElement('div');
    background.setAttribute('inert', '');
    document.body.append(background);
    const { unmount } = render(
      <Dialog open title="Details" onClose={() => {}}>
        Read-only details.
      </Dialog>,
    );
    unmount();
    expect(background).toHaveAttribute('inert');
    background.remove();
  });

  it.each([null, '', 'preexisting'])(
    'restores background inert state %j when nested dialogs unmount together',
    async (inertAttribute) => {
      const user = userEvent.setup();
      const background = document.createElement('div');
      if (inertAttribute !== null)
        background.setAttribute('inert', inertAttribute);
      document.body.append(background);
      const { container, unmount } = render(
        <StrictMode>
          <NestedDialogExample />
        </StrictMode>,
      );
      try {
        await user.click(screen.getByRole('button', { name: 'Open child' }));
        const parent = screen.getByRole('dialog', { name: 'Parent' });
        const child = screen.getByRole('dialog', { name: 'Child' });
        expect(container).toHaveAttribute('inert');
        expect(parent.closest('[inert]')).not.toBeNull();
        expect(child.closest('[inert]')).toBeNull();
        expect(
          screen.getByRole('button', { name: 'Child action' }),
        ).toHaveFocus();

        unmount();

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(container).not.toHaveAttribute('inert');
        expect(background.getAttribute('inert')).toBe(inertAttribute);
      } finally {
        unmount();
        background.remove();
      }
    },
  );

  it.each([null, '', 'preexisting'])(
    'keeps the child accessible and background inert until its close after parent-first removal with inert state %j',
    async (inertAttribute) => {
      const user = userEvent.setup();
      const background = document.createElement('div');
      if (inertAttribute !== null)
        background.setAttribute('inert', inertAttribute);
      document.body.append(background);
      const { container, rerender, unmount } = render(<NestedDialogExample />);
      try {
        await user.click(screen.getByRole('button', { name: 'Open child' }));

        rerender(<NestedDialogExample showParent={false} />);

        expect(
          screen.queryByRole('dialog', { name: 'Parent' }),
        ).not.toBeInTheDocument();
        expect(container).toHaveAttribute('inert');
        expect(background).toHaveAttribute('inert');
        expect(
          screen.getByRole('dialog', { name: 'Child' }).closest('[inert]'),
        ).toBeNull();
        screen.getByRole('button', { name: 'Outside action' }).focus();
        expect(
          screen.getByRole('button', { name: 'Child action' }),
        ).toHaveFocus();
        await user.tab({ shift: true });
        expect(
          screen.getByRole('button', { name: 'Close dialog' }),
        ).toHaveFocus();
        await user.tab();
        expect(
          screen.getByRole('button', { name: 'Child action' }),
        ).toHaveFocus();
        await user.keyboard('{Escape}');

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(container).not.toHaveAttribute('inert');
        expect(background.getAttribute('inert')).toBe(inertAttribute);
      } finally {
        unmount();
        background.remove();
      }
    },
  );

  it('falls back to an operable control when the requested initial focus is disabled', () => {
    function Example() {
      const initialFocus = useRef<HTMLButtonElement>(null);
      return (
        <Dialog
          open
          title="Details"
          onClose={() => {}}
          initialFocus={initialFocus}
        >
          <Button disabled ref={initialFocus}>
            Unavailable
          </Button>
          <Button>Available</Button>
        </Dialog>
      );
    }
    render(<Example />);
    expect(screen.getByRole('button', { name: 'Available' })).toHaveFocus();
  });

  it('limits keyboard handling to the top dialog and returns focus to its parent', async () => {
    const user = userEvent.setup();
    function Example() {
      const [parentOpen, setParentOpen] = useState(true);
      const [childOpen, setChildOpen] = useState(false);
      return (
        <>
          <Dialog
            open={parentOpen}
            title="Parent"
            onClose={() => setParentOpen(false)}
          >
            <Button onClick={() => setChildOpen(true)}>Open child</Button>
          </Dialog>
          <Dialog
            open={childOpen}
            title="Child"
            onClose={() => setChildOpen(false)}
          >
            Child details.
          </Dialog>
        </>
      );
    }
    render(<Example />);
    await user.keyboard('{Enter}');
    expect(screen.getByRole('dialog', { name: 'Child' })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('dialog', { name: 'Child' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open child' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
