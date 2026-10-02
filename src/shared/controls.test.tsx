import { render, screen, within } from '@testing-library/react';
import type { FormEvent } from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  Button,
  CheckboxField,
  DataList,
  DataTable,
  InputField,
  Link,
  SelectField,
  TextareaField,
} from './index';

describe('shared controls', () => {
  it('uses native keyboard buttons without submitting a surrounding form by default', async () => {
    const user = userEvent.setup();
    const activate = vi.fn();
    const submit = vi.fn((event: FormEvent<HTMLFormElement>) =>
      event.preventDefault(),
    );
    render(
      <form onSubmit={submit}>
        <Button onClick={activate}>Change selection</Button>
        <Button disabled onClick={activate}>
          Unavailable action
        </Button>
        <Button type="submit">Save</Button>
        <Link href="#details">Details</Link>
      </form>,
    );
    await user.tab();
    expect(
      screen.getByRole('button', { name: 'Change selection' }),
    ).toHaveFocus();
    await user.keyboard('{Enter} ');
    expect(activate).toHaveBeenCalledTimes(2);
    expect(submit).not.toHaveBeenCalled();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(submit).toHaveBeenCalledTimes(1);
    await user.tab();
    expect(screen.getByRole('link', { name: 'Details' })).toHaveFocus();
    expect(screen.getByRole('link', { name: 'Details' })).toHaveAttribute(
      'href',
      '#details',
    );
    await user.click(
      screen.getByRole('button', { name: 'Unavailable action' }),
    );
    expect(activate).toHaveBeenCalledTimes(2);
  });

  it('associates labels, hints, external descriptions and validation errors without losing input', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <InputField
        label="Display name"
        hint="Use a fictional name."
        defaultValue="Demo"
        required
        aria-describedby="extra"
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Display name' });
    await user.type(input, ' Person');
    rerender(
      <>
        <p id="extra">Visible in the demonstration.</p>
        <InputField
          label="Display name"
          hint="Use a fictional name."
          defaultValue="Demo"
          required
          error="Enter a longer name."
          aria-describedby="extra"
        />
      </>,
    );
    const invalid = screen.getByRole('textbox', { name: 'Display name' });
    expect(invalid).toBeRequired();
    expect(invalid).toHaveAttribute('aria-invalid', 'true');
    expect(invalid).toHaveAccessibleDescription(
      'Visible in the demonstration. Use a fictional name. Enter a longer name.',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a longer name.');
    await user.click(screen.getByText('Display name'));
    expect(invalid).toHaveFocus();
  });

  it('preserves a field value when validation feedback changes', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <InputField label="Name" defaultValue="Demo" />,
    );
    await user.type(screen.getByRole('textbox', { name: 'Name' }), ' Person');
    rerender(
      <InputField label="Name" defaultValue="Demo" error="Review this name." />,
    );
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue(
      'Demo Person',
    );
  });

  it('generates unique field IDs and accepts explicit IDs', () => {
    render(
      <>
        <InputField label="First" />
        <InputField label="Second" id="second-name" />
      </>,
    );
    const first = screen.getByRole('textbox', { name: 'First' });
    const second = screen.getByRole('textbox', { name: 'Second' });
    expect(first.id).not.toBe(second.id);
    expect(second).toHaveAttribute('id', 'second-name');
    expect(first).not.toHaveAttribute('aria-invalid');
  });

  it('exposes native select, textarea and checkbox controls with inline feedback', async () => {
    const user = userEvent.setup();
    render(
      <>
        <SelectField
          label="Choice"
          hint="Choose one."
          error="A selection is required."
          defaultValue=""
        >
          <option value="">Select</option>
          <option value="one">One</option>
        </SelectField>
        <TextareaField label="Notes" hint="Fictional details only." />
        <CheckboxField label="I understand" error="Confirm to continue." />
      </>,
    );
    const select = screen.getByRole('combobox', { name: 'Choice' });
    expect(select).toHaveAccessibleDescription(
      'Choose one. A selection is required.',
    );
    await user.selectOptions(select, 'one');
    expect(select).toHaveValue('one');
    await user.type(
      screen.getByRole('textbox', { name: 'Notes' }),
      'Demo note',
    );
    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveValue(
      'Demo note',
    );
    await user.click(screen.getByText('I understand'));
    const checkbox = screen.getByRole('checkbox', { name: 'I understand' });
    expect(checkbox).toBeChecked();
    expect(checkbox).toHaveAccessibleDescription('Confirm to continue.');
    await user.keyboard(' ');
    expect(checkbox).not.toBeChecked();
  });

  it('renders captioned tables with scoped headers and an explicit empty result', () => {
    const columns = [
      {
        key: 'name',
        header: 'Name',
        render: (row: { id: string; name: string }) => row.name,
      },
    ];
    const { rerender } = render(
      <DataTable
        caption="Demo records"
        columns={columns}
        rows={[{ id: 'one', name: 'Demo Person' }]}
        getRowKey={(row) => row.id}
      />,
    );
    const table = screen.getByRole('table', { name: 'Demo records' });
    expect(
      within(table).getByRole('columnheader', { name: 'Name' }),
    ).toHaveAttribute('scope', 'col');
    expect(
      within(table).getByRole('cell', { name: 'Demo Person' }),
    ).toBeVisible();
    rerender(
      <DataTable
        caption="Demo records"
        columns={columns}
        rows={[]}
        getRowKey={(row) => row.id}
        emptyMessage="No matching records."
      />,
    );
    expect(
      screen.getByRole('cell', { name: 'No matching records.' }),
    ).toHaveAttribute('colspan', '1');
  });

  it('renders a named native list and explicit empty-list feedback', () => {
    const { rerender } = render(
      <DataList label="Items" items={[{ id: 'one', content: 'First item' }]} />,
    );
    expect(
      within(screen.getByRole('list', { name: 'Items' })).getByRole('listitem'),
    ).toHaveTextContent('First item');
    rerender(
      <DataList label="Items" items={[]} emptyMessage="Nothing here." />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Nothing here.');
  });
});
