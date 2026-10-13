import { z } from 'zod';
import { XMLParser } from 'fast-xml-parser';
import { date } from './domain.js';
const label = z.string().trim().min(1).max(200);
export const partySchema = z.object({
  name: label,
  cui: z
    .string()
    .trim()
    .regex(/^(RO)?\d{2,10}$/i)
    .transform((v) => v.toUpperCase().replace(/^RO/, '')),
  vatRegistered: z.boolean().default(true),
  email: z.union([z.string().email(), z.literal('')]).default(''),
  street: label,
  city: label,
  county: z.string().regex(/^RO-[A-Z]{1,2}$/),
  postalCode: z.string().max(20).default(''),
  country: z.literal('RO').default('RO'),
  iban: z.string().trim().max(34).default(''),
  registration: z.string().max(100).default(''),
});
export const lineSchema = z
  .object({
    description: label,
    quantity: z.number().positive().max(1000000).multipleOf(0.001),
    unitPrice: z.number().min(0).max(1000000).multipleOf(0.01),
    vatRate: z.number().min(0).max(100).multipleOf(0.01),
    unit: z.enum(['HUR', 'C62', 'DAY']).default('HUR'),
    exemptionReason: z.string().max(300).default(''),
  })
  .refine(
    (l) => l.vatRate !== 0 || l.exemptionReason.trim().length > 0,
    'A zero-VAT line requires an exemption explanation',
  );
export const invoiceSchema = z
  .object({
    direction: z.enum(['sales', 'purchase']),
    partnerId: label,
    issueDate: date,
    dueDate: date,
    currency: z.enum(['RON', 'EUR', 'USD']).default('RON'),
    reference: z.string().max(100).default(''),
    series: z
      .string()
      .regex(/^[A-Z0-9-]{1,12}$/)
      .default('RO'),
    number: z.string().max(60).default(''),
    notes: z.string().max(3000).default(''),
    lines: z.array(lineSchema).min(1).max(200),
    timesheetIds: z.array(z.string()).max(500).default([]),
  })
  .refine((i) => i.dueDate >= i.issueDate, 'Due date must not precede issue date')
  .refine(
    (i) => i.direction !== 'purchase' || i.number.trim().length > 0,
    'Supplier invoice number is required',
  );
const rounded = (numerator, denominator) => (numerator + denominator / 2n) / denominator;
export function calculateTotals(lines) {
  const groups = new Map();
  let netCents = 0n;
  const calculated = lines.map((line) => {
    const net = rounded(
        BigInt(Math.round(line.unitPrice * 100)) * BigInt(Math.round(line.quantity * 1000)),
        1000n,
      ),
      rate = Math.round(line.vatRate * 100),
      key = `${rate}:${line.exemptionReason ?? ''}`;
    netCents += net;
    const group = groups.get(key) ?? { rate, net: 0n, exemptionReason: line.exemptionReason ?? '' };
    group.net += net;
    groups.set(key, group);
    return { ...line, netCents: Number(net) };
  });
  let taxCents = 0n;
  const taxes = [...groups.values()].map((g) => {
    const tax = rounded(g.net * BigInt(g.rate), 10000n);
    taxCents += tax;
    return {
      rate: g.rate / 100,
      netCents: Number(g.net),
      taxCents: Number(tax),
      exemptionReason: g.exemptionReason,
    };
  });
  if (netCents + taxCents > 900000000000000n)
    throw Object.assign(Error('Invoice total exceeds the supported amount'), { status: 400 });
  return {
    lines: calculated,
    netCents: Number(netCents),
    taxCents: Number(taxCents),
    totalCents: Number(netCents + taxCents),
    taxes,
  };
}
const escape = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c],
  );
const money = (cents) => (cents / 100).toFixed(2);
function partyXML(p) {
  return `<cac:Party><cac:PartyIdentification><cbc:ID>${escape(p.cui)}</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>${escape(p.name)}</cbc:Name></cac:PartyName><cac:PostalAddress><cbc:StreetName>${escape(p.street)}</cbc:StreetName><cbc:CityName>${escape(p.city)}</cbc:CityName>${p.postalCode ? `<cbc:PostalZone>${escape(p.postalCode)}</cbc:PostalZone>` : ''}<cbc:CountrySubentity>${escape(p.county)}</cbc:CountrySubentity><cac:Country><cbc:IdentificationCode>RO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>${p.vatRegistered ? `<cac:PartyTaxScheme><cbc:CompanyID>RO${escape(p.cui)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : ''}<cac:PartyLegalEntity><cbc:RegistrationName>${escape(p.name)}</cbc:RegistrationName><cbc:CompanyID>${escape(p.cui)}</cbc:CompanyID></cac:PartyLegalEntity>${p.email ? `<cac:Contact><cbc:ElectronicMail>${escape(p.email)}</cbc:ElectronicMail></cac:Contact>` : ''}</cac:Party>`;
}
export function invoiceXML(invoice) {
  const t = calculateTotals(invoice.lines),
    unit = escape(invoice.currency),
    supplier = invoice.seller,
    buyer = invoice.buyer;
  const taxCategory = (rate, reason) =>
    `<cbc:ID>${rate > 0 ? 'S' : 'E'}</cbc:ID><cbc:Percent>${rate.toFixed(2)}</cbc:Percent>${rate === 0 ? `<cbc:TaxExemptionReason>${escape(reason)}</cbc:TaxExemptionReason>` : ''}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"><cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:efactura.mfinante.ro:CIUS-RO:1.0.1</cbc:CustomizationID><cbc:ID>${escape(invoice.number)}</cbc:ID><cbc:IssueDate>${invoice.issueDate}</cbc:IssueDate><cbc:DueDate>${invoice.dueDate}</cbc:DueDate><cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>${invoice.notes ? `<cbc:Note>${escape(invoice.notes)}</cbc:Note>` : ''}<cbc:DocumentCurrencyCode>${unit}</cbc:DocumentCurrencyCode>${invoice.reference ? `<cac:OrderReference><cbc:ID>${escape(invoice.reference)}</cbc:ID></cac:OrderReference>` : ''}<cac:AccountingSupplierParty>${partyXML(supplier)}</cac:AccountingSupplierParty><cac:AccountingCustomerParty>${partyXML(buyer)}</cac:AccountingCustomerParty>${supplier.iban ? `<cac:PaymentMeans><cbc:PaymentMeansCode>30</cbc:PaymentMeansCode><cac:PayeeFinancialAccount><cbc:ID>${escape(supplier.iban)}</cbc:ID></cac:PayeeFinancialAccount></cac:PaymentMeans>` : ''}<cac:TaxTotal><cbc:TaxAmount currencyID="${unit}">${money(t.taxCents)}</cbc:TaxAmount>${t.taxes.map((g) => `<cac:TaxSubtotal><cbc:TaxableAmount currencyID="${unit}">${money(g.netCents)}</cbc:TaxableAmount><cbc:TaxAmount currencyID="${unit}">${money(g.taxCents)}</cbc:TaxAmount><cac:TaxCategory>${taxCategory(g.rate, g.exemptionReason)}</cac:TaxCategory></cac:TaxSubtotal>`).join('')}</cac:TaxTotal><cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="${unit}">${money(t.netCents)}</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="${unit}">${money(t.netCents)}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="${unit}">${money(t.totalCents)}</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="${unit}">${money(t.totalCents)}</cbc:PayableAmount></cac:LegalMonetaryTotal>${t.lines.map((line, i) => `<cac:InvoiceLine><cbc:ID>${i + 1}</cbc:ID><cbc:InvoicedQuantity unitCode="${line.unit}">${line.quantity}</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="${unit}">${money(line.netCents)}</cbc:LineExtensionAmount><cac:Item><cbc:Name>${escape(line.description)}</cbc:Name><cac:ClassifiedTaxCategory>${taxCategory(line.vatRate, line.exemptionReason)}</cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="${unit}">${line.unitPrice.toFixed(2)}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>`).join('')}</Invoice>`;
}
export function parseXML(xml) {
  if (Buffer.byteLength(xml) > 5 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(xml))
    throw Object.assign(Error('Unsafe or oversized XML document'), { status: 400 });
  return new XMLParser({
    removeNSPrefix: true,
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseTagValue: false,
    parseAttributeValue: false,
    processEntities: true,
  }).parse(xml);
}
export function readIncomingInvoice(xml, companyCui) {
  const root = parseXML(xml).Invoice;
  if (!root)
    throw Object.assign(Error('Only UBL Invoice documents can be imported into payables'), {
      status: 400,
    });
  const text = (v) => (typeof v === 'object' ? (v?.['#text'] ?? '') : String(v ?? '')),
    party = (p) => {
      const x = p?.Party ?? {},
        address = x.PostalAddress ?? {},
        legal = x.PartyLegalEntity ?? {};
      return {
        name: text(legal.RegistrationName || x.PartyName?.Name),
        cui: text(legal.CompanyID || x.PartyTaxScheme?.CompanyID).replace(/^RO/i, ''),
        vatRegistered: !!x.PartyTaxScheme,
        street: text(address.StreetName),
        city: text(address.CityName),
        county: text(address.CountrySubentity),
        postalCode: text(address.PostalZone),
        country: text(address.Country?.IdentificationCode),
        email: text(x.Contact?.ElectronicMail),
        iban: '',
      };
    };
  const seller = party(root.AccountingSupplierParty),
    buyer = party(root.AccountingCustomerParty);
  if (buyer.cui !== companyCui)
    throw Object.assign(
      Error('Incoming invoice buyer does not match your configured company CUI'),
      { status: 400 },
    );
  const totalCents = Math.round(Number(text(root.LegalMonetaryTotal?.PayableAmount)) * 100),
    netCents = Math.round(Number(text(root.LegalMonetaryTotal?.TaxExclusiveAmount)) * 100),
    taxCents = Math.round(
      Number(text((Array.isArray(root.TaxTotal) ? root.TaxTotal[0] : root.TaxTotal)?.TaxAmount)) *
        100,
    );
  if (
    !Number.isSafeInteger(totalCents) ||
    totalCents < 0 ||
    !Number.isSafeInteger(netCents) ||
    !Number.isSafeInteger(taxCents)
  )
    throw Object.assign(Error('Invalid incoming invoice totals'), { status: 400 });
  const lines = [root.InvoiceLine ?? []].flat().map((l) => ({
    description: text(l.Item?.Name),
    quantity: Number(text(l.InvoicedQuantity)),
    unitPrice: Number(text(l.Price?.PriceAmount)),
    vatRate: Number(text(l.Item?.ClassifiedTaxCategory?.Percent)),
    unit: l.InvoicedQuantity?.unitCode ?? 'C62',
    netCents: Math.round(Number(text(l.LineExtensionAmount)) * 100),
  }));
  return {
    number: text(root.ID),
    issueDate: date.parse(text(root.IssueDate)),
    dueDate: date.parse(text(root.DueDate || root.IssueDate)),
    currency: z.enum(['RON', 'EUR', 'USD']).parse(text(root.DocumentCurrencyCode)),
    seller,
    buyer,
    lines,
    netCents,
    taxCents,
    totalCents,
    notes: text(root.Note),
    reference: text(root.OrderReference?.ID),
  };
}
