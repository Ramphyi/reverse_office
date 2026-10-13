import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Building2,
  Download,
  Plus,
  Printer,
  RefreshCw,
  ReceiptText,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { api, currency, isoToday, type Item, type State, type User } from './api';
import { Badge, Empty, FormModal, Modal, type Field } from './components';

const partyFields: Field[] = [
  { key: 'name', label: 'Legal name', required: true },
  { key: 'cui', label: 'CUI', required: true },
  { key: 'vatRegistered', label: 'VAT registered', type: 'checkbox', default: true },
  { key: 'street', label: 'Street address', required: true },
  { key: 'city', label: 'City', required: true },
  {
    key: 'county',
    label: 'County code',
    required: true,
    default: 'RO-B',
    help: 'ISO code, for example RO-B or RO-CJ. Bucharest city must use the required sector format.',
  },
  { key: 'postalCode', label: 'Postal code' },
  { key: 'email', label: 'Billing email', type: 'email' },
  { key: 'iban', label: 'IBAN' },
  { key: 'registration', label: 'Trade register number' },
];
const blankLine = () => ({
  description: '',
  quantity: 1,
  unitPrice: 0,
  vatRate: '',
  unit: 'HUR',
  exemptionReason: '',
});
export function Romania({
  user,
  state,
  notify,
}: {
  user: User;
  state: State;
  notify: (s: string) => void;
}) {
  const [data, setData] = useState<Item | null>(null),
    [tab, setTab] = useState('Invoices'),
    [modal, setModal] = useState<any>(null),
    [selected, setSelected] = useState<Item | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const refresh = async () => {
    const next = await api('/ro/state');
    setData(next);
    setSelected((s) => (s ? (next.invoices.find((i: Item) => i.id === s.id) ?? null) : null));
  };
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, []);
  async function action(path: string, body: Item = {}, message = 'Saved') {
    setBusy(true);
    setError('');
    try {
      const result = await api('/ro' + path, 'POST', body);
      await refresh();
      notify(message);
      return result;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  if (!data) return <div className="panel padded">{error || 'Loading billing workspace…'}</div>;
  const invoices: Item[] = data.invoices,
    partners: Item[] = data.partners;
  const partyForm = (kind: string, initial?: Item) =>
    setModal({
      title:
        kind === 'company'
          ? 'Company details'
          : kind === 'customer'
            ? 'Customer details'
            : 'Supplier details',
      fields: partyFields,
      initial: initial ?? {},
      submit: async (d: Item) => {
        await api(
          kind === 'company' ? '/ro/company' : '/ro/partners' + (d.id ? '/' + d.id : ''),
          kind === 'company' || d.id ? 'PUT' : 'POST',
          { ...d, ...(kind === 'company' ? {} : { kind }) },
        );
        await refresh();
        notify('Details saved');
      },
    });
  const newInvoice = (direction: string) => {
    if (!data.company) {
      setTab('Company');
      setError('Set up your company before creating an invoice.');
      return;
    }
    setModal({
      invoice: {
        direction,
        partnerId: '',
        issueDate: isoToday(),
        dueDate: isoToday(),
        currency: 'RON',
        series: 'RO',
        number: '',
        reference: '',
        notes: '',
        lines: [blankLine()],
        timesheetIds: [],
      },
    });
  };
  const invoiceList = invoices.filter(
    (i) => i.direction === (tab === 'Payables' ? 'purchase' : 'sales'),
  );
  const outstanding = (direction: string) =>
    Object.entries(
      invoices
        .filter((i) => i.direction === direction && i.status !== 'Draft')
        .reduce(
          (sum: Item, i: Item) => ({
            ...sum,
            [i.currency]: (sum[i.currency] ?? 0) + i.totalCents - i.paidCents,
          }),
          {},
        ),
    )
      .map(([unit, value]) => currency(Number(value) / 100, unit))
      .join(' · ') || '—';
  return (
    <div className="ro-workspace">
      <div className="ro-banner">
        <div>
          <span className="eyebrow">FINANCE WORKSPACE · ROMANIA</span>
          <h2>
            From work delivered
            <br />
            to invoices settled.
          </h2>
          <p>Customers, suppliers and e-Factura, alongside your team’s work.</p>
        </div>
        <ReceiptText size={80} strokeWidth={1} />
      </div>
      <div className="ro-stats">
        <div>
          <small>TO COLLECT</small>
          <strong>{outstanding('sales')}</strong>
        </div>
        <div>
          <small>TO PAY</small>
          <strong>{outstanding('purchase')}</strong>
        </div>
        <div>
          <small>SPV CONNECTION</small>
          <strong>{data.spv.connected ? 'Connected' : 'Not configured'}</strong>
          <Badge>{data.spv.environment}</Badge>
        </div>
      </div>
      <div className="tabs ro-tabs">
        {['Invoices', 'Payables', 'Customers', 'Suppliers', 'Company', 'SPV'].map((t) => (
          <button
            key={t}
            className={tab === t ? 'active' : ''}
            onClick={() => {
              setTab(t);
              setError('');
            }}
          >
            {t}
          </button>
        ))}
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {['Invoices', 'Payables'].includes(tab) && (
        <>
          <div className="section-bar">
            <div>
              <h2>{tab === 'Invoices' ? 'Sales invoices' : 'Supplier invoices'}</h2>
              <small className="muted">Amounts include tax. Payments are recorded locally.</small>
            </div>
            <button
              className="button primary"
              onClick={() => newInvoice(tab === 'Invoices' ? 'sales' : 'purchase')}
            >
              <Plus size={16} />
              New {tab === 'Invoices' ? 'invoice' : 'payable'}
            </button>
          </div>
          {invoiceList.length ? (
            <div className="panel data-table">
              <table>
                <thead>
                  <tr>
                    <th>Invoice / partner</th>
                    <th>Due date</th>
                    <th>Status</th>
                    <th>Total</th>
                    <th>Outstanding</th>
                    <th>SPV</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceList.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <button className="text-button" onClick={() => setSelected(i)}>
                          {i.number || 'Draft invoice'}
                        </button>
                        <small>{i.direction === 'sales' ? i.buyer.name : i.seller.name}</small>
                      </td>
                      <td>{i.dueDate}</td>
                      <td>
                        <Badge>{i.status}</Badge>
                      </td>
                      <td>{currency(i.totalCents / 100, i.currency)}</td>
                      <td>{currency((i.totalCents - i.paidCents) / 100, i.currency)}</td>
                      <td>
                        <Badge>{i.spv.state}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title={
                tab === 'Invoices'
                  ? 'Your next invoice starts here'
                  : 'Keep supplier payments in sight'
              }
              description="Create a draft, review the amounts, then issue it."
            />
          )}
        </>
      )}
      {['Customers', 'Suppliers'].includes(tab) && (
        <>
          <div className="section-bar">
            <h2>{tab}</h2>
            <button
              className="button primary"
              onClick={() => partyForm(tab === 'Customers' ? 'customer' : 'supplier')}
            >
              <Plus size={16} />
              Add {tab === 'Customers' ? 'customer' : 'supplier'}
            </button>
          </div>
          <div className="ro-partners">
            {partners
              .filter((p) => p.kind === (tab === 'Customers' ? 'customer' : 'supplier'))
              .map((p) => (
                <button className="panel ro-party" key={p.id} onClick={() => partyForm(p.kind, p)}>
                  <Building2 size={24} />
                  <strong>{p.name}</strong>
                  <span>CUI {p.cui}</span>
                  <small>
                    {p.city} · {p.email || 'No billing email'}
                  </small>
                </button>
              ))}
          </div>
        </>
      )}
      {tab === 'Company' && (
        <div className="panel padded">
          <h2>{data.company?.name || 'Your company'}</h2>
          <p className="muted">
            Set the legal identity used on sales invoices and to match incoming SPV invoices.
          </p>
          {data.company && (
            <p>
              CUI {data.company.cui} · {data.company.street}, {data.company.city}
            </p>
          )}
          {user.role === 'admin' ? (
            <button className="button primary" onClick={() => partyForm('company', data.company)}>
              <Building2 size={16} />
              Edit company details
            </button>
          ) : (
            <p>An administrator can change company details.</p>
          )}
          <p className="muted ro-note">
            The SPV adapter currently supports domestic RON invoices with standard VAT or exemption.
            Enter the applicable rate and exemption reason. Foreign-currency tax conversion, credit
            notes and full accounting are outside this release.
          </p>
        </div>
      )}
      {tab === 'SPV' && (
        <>
          <div className="panel padded">
            <div className="section-bar">
              <div>
                <h2>
                  <ShieldCheck size={20} /> ANAF e-Factura
                </h2>
                <p>
                  Destination: <strong>{data.spv.environment}</strong> ·{' '}
                  {data.spv.connected ? 'Account connected' : 'Account not connected'}
                </p>
              </div>
              <Badge>
                {data.spv.environment === 'production' && !data.spv.productionEnabled
                  ? 'Production blocked'
                  : data.spv.environment}
              </Badge>
            </div>
            <p className="muted">
              Use a registered ANAF application and an authorized company certificate to connect.
              Test submissions stay in the ANAF test environment. Each sales invoice must pass ANAF
              validation before you explicitly submit it.
            </p>
            <div className="heading-actions">
              {user.role === 'admin' && (
                <button
                  disabled={busy || !data.spv.oauthConfigured}
                  className="button primary"
                  onClick={async () => {
                    const result = await action('/spv/connect', {}, 'Opening ANAF authorization');
                    if (result) window.location.assign(result.url);
                  }}
                >
                  Connect ANAF <ArrowUpRight size={16} />
                </button>
              )}
              <button
                className="button secondary"
                disabled={busy || !data.spv.connected}
                onClick={() => action('/spv/sync', { days: 30 }, 'SPV messages synchronized')}
              >
                <RefreshCw size={16} />
                Sync last 30 days
              </button>
            </div>
            {!data.spv.oauthConfigured && (
              <p className="muted ro-note">
                Server setup required: ANAF_CLIENT_ID, ANAF_CLIENT_SECRET, ANAF_REDIRECT_URI and
                SPV_ENCRYPTION_KEY. See docs/ROMANIA.md.
              </p>
            )}
          </div>
          <div className="section-bar">
            <h2>Messages & incoming invoices</h2>
            <small>Archives are retained with SHA-256 provenance.</small>
          </div>
          <div className="panel data-table">
            <table>
              <thead>
                <tr>
                  <th>Message</th>
                  <th>Details</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.messages.map((m: Item) => (
                  <tr key={m.id}>
                    <td>
                      {m.remoteId}
                      <small>
                        {m.type} · {m.environment}
                      </small>
                    </td>
                    <td>{m.detail}</td>
                    <td>
                      <a
                        className="button secondary"
                        href={'/api/ro/spv/messages/' + m.id + '/download'}
                      >
                        Archive
                      </a>
                      <button
                        className="button secondary"
                        disabled={busy || m.environment !== data.spv.environment}
                        onClick={() =>
                          action(
                            '/spv/messages/' + m.id + '/import',
                            {},
                            'Imported into payables; review before payment',
                          )
                        }
                      >
                        Import payable
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.messages.length && (
              <Empty
                title="No synchronized messages"
                description="Connect ANAF, then sync the message list."
              />
            )}
          </div>
        </>
      )}
      {modal?.fields && (
        <FormModal
          title={modal.title}
          fields={modal.fields}
          initial={modal.initial}
          onSubmit={modal.submit}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.invoice && (
        <InvoiceForm
          initial={modal.invoice}
          partners={partners}
          state={state}
          invoices={invoices}
          onClose={() => setModal(null)}
          onSave={async (d) => {
            await api('/ro/invoices' + (d.id ? '/' + d.id : ''), d.id ? 'PUT' : 'POST', d);
            await refresh();
            notify('Invoice draft saved');
          }}
        />
      )}
      {selected && (
        <Modal
          title={selected.number || 'Draft invoice'}
          description={`${selected.direction === 'sales' ? 'Sales invoice' : 'Supplier invoice'} · ${selected.status}`}
          wide
          onClose={() => {
            setSelected(null);
            setError('');
          }}
        >
          <article className="ro-invoice-print">
            <div className="ro-invoice-parties">
              <div>
                <small>SUPPLIER</small>
                <h3>{selected.seller.name}</h3>
                <p>
                  CUI {selected.seller.cui}
                  <br />
                  {selected.seller.street}
                  <br />
                  {selected.seller.city}, {selected.seller.county}
                </p>
              </div>
              <div>
                <small>CUSTOMER</small>
                <h3>{selected.buyer.name}</h3>
                <p>
                  CUI {selected.buyer.cui}
                  <br />
                  {selected.buyer.street}
                  <br />
                  {selected.buyer.city}, {selected.buyer.county}
                </p>
              </div>
              <div>
                <small>INVOICE</small>
                <h3>{selected.number || 'DRAFT'}</h3>
                <p>
                  Issued {selected.issueDate}
                  <br />
                  Due {selected.dueDate}
                  <br />
                  PO {selected.reference || '—'}
                </p>
              </div>
            </div>
            <div className="data-table">
              <table>
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Quantity</th>
                    <th>Unit price</th>
                    <th>VAT</th>
                    <th>Net amount</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.lines.map((l: Item, k: number) => (
                    <tr key={k}>
                      <td>
                        {l.description}
                        {l.exemptionReason && <small>{l.exemptionReason}</small>}
                      </td>
                      <td>
                        {l.quantity} {l.unit}
                      </td>
                      <td>{currency(l.unitPrice, selected.currency)}</td>
                      <td>{l.vatRate}%</td>
                      <td>{currency(l.netCents / 100, selected.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="ro-totals">
              <p>
                Net <strong>{currency(selected.netCents / 100, selected.currency)}</strong>
              </p>
              <p>
                Tax <strong>{currency(selected.taxCents / 100, selected.currency)}</strong>
              </p>
              <h3>
                Total <span>{currency(selected.totalCents / 100, selected.currency)}</span>
              </h3>
              <p>
                Paid <strong>{currency(selected.paidCents / 100, selected.currency)}</strong>
              </p>
            </div>
            <p>{selected.notes}</p>
            {selected.seller.iban && <p>IBAN: {selected.seller.iban}</p>}
          </article>
          {selected.imported && (
            <p className="ro-note">
              Imported from ANAF archive. Review the invoice against the retained original. Ministry
              signature verification is not implemented.
            </p>
          )}
          {selected.validation && (
            <p>
              ANAF validation: <Badge>{selected.validation.valid ? 'Passed' : 'Failed'}</Badge>
              {!selected.validation.valid && (
                <pre className="ro-response">
                  {JSON.stringify(selected.validation.result, null, 2)}
                </pre>
              )}
            </p>
          )}
          {selected.spv.error && <p className="error">{selected.spv.error}</p>}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="ro-invoice-actions">
            <button className="button secondary" onClick={() => window.print()}>
              <Printer size={16} />
              Print / PDF
            </button>
            {selected.status === 'Draft' ? (
              <>
                <button
                  className="button secondary"
                  onClick={() => {
                    setModal({ invoice: selected });
                    setSelected(null);
                  }}
                >
                  Edit draft
                </button>
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => {
                    if (
                      confirm('Issue this invoice? Its number and amounts will become permanent.')
                    )
                      action('/invoices/' + selected.id + '/issue', {}, 'Invoice issued');
                  }}
                >
                  Issue invoice
                </button>
                <button
                  aria-label="Delete draft"
                  className="icon-button"
                  onClick={async () => {
                    if (confirm('Delete this draft?')) {
                      try {
                        await api('/ro/invoices/' + selected.id, 'DELETE');
                        setSelected(null);
                        await refresh();
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </>
            ) : (
              <>
                {!selected.imported && (
                  <a className="button secondary" href={'/api/ro/invoices/' + selected.id + '/xml'}>
                    <Download size={16} />
                    UBL XML
                  </a>
                )}
                {selected.totalCents > selected.paidCents && (
                  <button
                    className="button secondary"
                    onClick={() => {
                      const id = selected.id;
                      setSelected(null);
                      setModal({
                        title: 'Record payment',
                        fields: [
                          {
                            key: 'amount',
                            label: 'Amount',
                            type: 'number',
                            required: true,
                            min: 0.01,
                            step: '.01',
                            default: (selected.totalCents - selected.paidCents) / 100,
                          },
                          {
                            key: 'date',
                            label: 'Payment date',
                            type: 'date',
                            required: true,
                            default: isoToday(),
                          },
                          { key: 'reference', label: 'Bank reference', required: true },
                        ],
                        submit: async (d: Item) => {
                          await api('/ro/invoices/' + id + '/payments', 'POST', {
                            amountCents: Math.round(d.amount * 100),
                            date: d.date,
                            reference: d.reference,
                          });
                          await refresh();
                          notify('Payment recorded');
                        },
                      });
                    }}
                  >
                    Record payment
                  </button>
                )}
                {selected.direction === 'sales' && (
                  <>
                    <button
                      className="button secondary"
                      disabled={busy || selected.currency !== 'RON'}
                      onClick={() =>
                        action(
                          '/invoices/' + selected.id + '/validate',
                          {},
                          'Validation result received',
                        )
                      }
                    >
                      Validate with ANAF
                    </button>
                    {selected.spv.state === 'Not sent' && (
                      <button
                        className="button primary"
                        disabled={busy || !selected.validation?.valid || !data.spv.connected}
                        onClick={() => {
                          if (
                            confirm(
                              `Send invoice ${selected.number} to ANAF ${data.spv.environment}? This transfers the invoice and company data to ANAF.`,
                            )
                          )
                            action(
                              '/invoices/' + selected.id + '/submit',
                              { confirm: `${data.spv.environment}:${selected.number}` },
                              'Submission response received',
                            );
                        }}
                      >
                        Send to SPV · {data.spv.environment}
                      </button>
                    )}
                    {selected.spv.index && (
                      <button
                        disabled={busy}
                        className="button secondary"
                        onClick={() =>
                          action('/invoices/' + selected.id + '/status', {}, 'SPV status updated')
                        }
                      >
                        Refresh SPV status
                      </button>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
function InvoiceForm({
  initial,
  partners,
  state,
  invoices,
  onClose,
  onSave,
}: {
  initial: Item;
  partners: Item[];
  state: State;
  invoices: Item[];
  onClose: () => void;
  onSave: (d: Item) => Promise<void>;
}) {
  const [d, set] = useState<Item>({
      ...initial,
      lines: initial.lines.map((l: Item) => ({ ...l })),
    }),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const update = (key: string, value: any) => set({ ...d, [key]: value }),
    line = (index: number, key: string, value: any) =>
      set({
        ...d,
        lines: d.lines.map((l: Item, i: number) => (i === index ? { ...l, [key]: value } : l)),
      });
  const partner = partners.find((p) => p.id === d.partnerId),
    available = (state.timesheets ?? []).filter(
      (t) =>
        t.status === 'Approved' &&
        t.billingSnapshot?.client === partner?.name &&
        t.billingSnapshot?.currency === d.currency &&
        !invoices.some((i) => i.id !== d.id && i.timesheetIds?.includes(t.id)),
    );
  return (
    <Modal
      title={d.id ? 'Edit invoice draft' : 'New invoice draft'}
      description="Review tax rates and details before issuing. Server calculations are authoritative."
      wide
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onSave({
              ...d,
              lines: d.lines.map((l: Item) => ({
                ...l,
                quantity: Number(l.quantity),
                unitPrice: Number(l.unitPrice),
                vatRate: Number(l.vatRate),
              })),
            });
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-fields">
          <label>
            Partner
            <select
              aria-label="Partner"
              required
              value={d.partnerId}
              onChange={(e) => set({ ...d, partnerId: e.target.value, timesheetIds: [] })}
            >
              <option value="">Select a {d.direction === 'sales' ? 'customer' : 'supplier'}</option>
              {partners
                .filter((p) => p.kind === (d.direction === 'sales' ? 'customer' : 'supplier'))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
          {[
            ['issueDate', 'Invoice date', 'date'],
            ['dueDate', 'Due date', 'date'],
            [
              d.direction === 'sales' ? 'series' : 'number',
              d.direction === 'sales' ? 'Series' : 'Supplier invoice number',
              'text',
            ],
            ['reference', 'PO / reference', 'text'],
          ].map(([key, label, type]) => (
            <label key={key}>
              {label}
              <input
                aria-label={label}
                required={key !== 'reference'}
                type={type}
                value={d[key]}
                onChange={(e) => update(key, e.target.value)}
              />
            </label>
          ))}
          <label>
            Currency
            <select
              aria-label="Currency"
              value={d.currency}
              onChange={(e) => set({ ...d, currency: e.target.value, timesheetIds: [] })}
            >
              {['RON', 'EUR', 'USD'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <h3>Invoice lines</h3>
        <div className="ro-lines">
          {d.lines.map((l: Item, i: number) => (
            <div className="ro-line" key={i}>
              <label>
                Description
                <input
                  aria-label={`Line ${i + 1} description`}
                  required
                  value={l.description}
                  onChange={(e) => line(i, 'description', e.target.value)}
                />
              </label>
              <label>
                Quantity
                <input
                  aria-label={`Line ${i + 1} quantity`}
                  type="number"
                  min="0.001"
                  step="0.001"
                  required
                  value={l.quantity}
                  onChange={(e) => line(i, 'quantity', e.target.value)}
                />
              </label>
              <label>
                Unit price
                <input
                  aria-label={`Line ${i + 1} price`}
                  type="number"
                  min="0"
                  step=".01"
                  required
                  value={l.unitPrice}
                  onChange={(e) => line(i, 'unitPrice', e.target.value)}
                />
              </label>
              <label>
                VAT %
                <input
                  aria-label={`Line ${i + 1} VAT`}
                  type="number"
                  min="0"
                  max="100"
                  step=".01"
                  required
                  value={l.vatRate}
                  onChange={(e) => line(i, 'vatRate', e.target.value)}
                />
              </label>
              <label>
                Unit
                <select value={l.unit} onChange={(e) => line(i, 'unit', e.target.value)}>
                  <option value="HUR">Hours</option>
                  <option value="DAY">Days</option>
                  <option value="C62">Units</option>
                </select>
              </label>
              {Number(l.vatRate) === 0 && (
                <label className="ro-exemption">
                  Exemption reason
                  <input
                    required
                    value={l.exemptionReason}
                    onChange={(e) => line(i, 'exemptionReason', e.target.value)}
                  />
                </label>
              )}
              {d.lines.length > 1 && (
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove line ${i + 1}`}
                  onClick={() =>
                    update(
                      'lines',
                      d.lines.filter((_: Item, k: number) => k !== i),
                    )
                  }
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          className="button secondary"
          onClick={() => update('lines', [...d.lines, blankLine()])}
        >
          <Plus size={16} />
          Add line
        </button>
        {d.direction === 'sales' && (
          <details className="ro-timesheets">
            <summary>Use approved timesheets ({available.length} available)</summary>
            <p className="muted">
              Customer legal name must match the project client. Selected entries replace the lines
              above using the approved rate and the first line’s VAT rate.
            </p>
            {available.map((t) => (
              <label className="check-field" key={t.id}>
                <input
                  type="checkbox"
                  checked={d.timesheetIds.includes(t.id)}
                  onChange={(e) =>
                    update(
                      'timesheetIds',
                      e.target.checked
                        ? [...d.timesheetIds, t.id]
                        : d.timesheetIds.filter((id: string) => id !== t.id),
                    )
                  }
                />
                {t.date} · {t.hours} h · {t.description}
              </label>
            ))}
          </details>
        )}
        <label className="ro-notes">
          Notes
          <textarea value={d.notes} onChange={(e) => update('notes', e.target.value)} />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            Save draft
          </button>
        </div>
      </form>
    </Modal>
  );
}
