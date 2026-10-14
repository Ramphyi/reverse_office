import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  Header,
  Footer,
  PageNumber,
  AlignmentType,
} from 'docx';
import ExcelJS from 'exceljs';
import pptxgen from 'pptxgenjs';
import JSZip from 'jszip';
export const templates = [
  {
    id: 'writer-blank',
    kind: 'doc',
    name: 'Blank document',
    description: 'A clean page for your next idea.',
    tags: ['A4', 'Editable'],
    accent: '#4a78c2',
  },
  {
    id: 'writer-report',
    kind: 'doc',
    name: 'Business report',
    description: 'Cover, executive summary, structured sections and a results table.',
    tags: ['Cover', 'Tables', 'Page numbers'],
    accent: '#4a78c2',
  },
  {
    id: 'writer-proposal',
    kind: 'doc',
    name: 'Project proposal',
    description: 'Scope, deliverables, timeline, commercial terms and sign-off.',
    tags: ['Proposal', 'Client-ready'],
    accent: '#8d6bc4',
  },
  {
    id: 'writer-meeting',
    kind: 'doc',
    name: 'Meeting notes',
    description: 'Agenda, decisions and an action register.',
    tags: ['Agenda', 'Actions'],
    accent: '#c08650',
  },
  {
    id: 'sheet-blank',
    kind: 'sheet',
    name: 'Blank workbook',
    description: 'A native workbook, ready for formulas and charts.',
    tags: ['XLSX', 'Formulas'],
    accent: '#34876d',
  },
  {
    id: 'sheet-budget',
    kind: 'sheet',
    name: 'Project budget',
    description: 'Budget versus actuals, formulas, variance chart and a assumptions sheet.',
    tags: ['Chart', '2 worksheets', 'Formulas'],
    accent: '#34876d',
  },
  {
    id: 'sheet-sales',
    kind: 'sheet',
    name: 'Sales dashboard',
    description: 'Monthly revenue, targets, totals and a native column chart.',
    tags: ['Chart', 'Dashboard', 'Filters'],
    accent: '#488a99',
  },
  {
    id: 'sheet-tracker',
    kind: 'sheet',
    name: 'Project tracker',
    description: 'Owners, milestones, status dropdowns and a frozen header.',
    tags: ['Dropdowns', 'Filters', 'Dates'],
    accent: '#b88845',
  },
  {
    id: 'slides-blank',
    kind: 'slides',
    name: 'Blank presentation',
    description: 'A widescreen canvas to build your story.',
    tags: ['16:9', 'PPTX'],
    accent: '#c27d54',
  },
  {
    id: 'slides-pitch',
    kind: 'slides',
    name: 'Studio pitch',
    description: 'An eight-slide story with editable layouts, shapes and a chart.',
    tags: ['8 slides', 'Chart', 'Widescreen'],
    accent: '#c27d54',
  },
  {
    id: 'slides-review',
    kind: 'slides',
    name: 'Quarterly review',
    description: 'Results, KPIs, financial chart, learnings and next steps.',
    tags: ['6 slides', 'Metrics', 'Chart'],
    accent: '#6b72c7',
  },
  {
    id: 'slides-workshop',
    kind: 'slides',
    name: 'Team workshop',
    description: 'Agenda, exercises, discussion prompts and a closing action plan.',
    tags: ['6 slides', 'Workshop'],
    accent: '#3c8a7d',
  },
];
const p = (text, opts = {}) =>
  new Paragraph({ ...opts, children: [new TextRun({ text, font: 'Aptos', size: 23 })] });
function table(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      (row, i) =>
        new TableRow({
          children: row.map(
            (text) =>
              new TableCell({
                shading: i === 0 ? { fill: '245741' } : undefined,
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text,
                        bold: i === 0,
                        color: i === 0 ? 'FFFFFF' : '263F35',
                        size: 21,
                      }),
                    ],
                  }),
                ],
              }),
          ),
        }),
    ),
  });
}
async function writer(id, title) {
  const children = [];
  if (id !== 'writer-blank') {
    children.push(
      new Paragraph({
        text: 'REVERSE OFFICE  /  WORKING DOCUMENT',
        spacing: { after: 600 },
        children: [new TextRun({ text: '', color: '708578' })],
      }),
      new Paragraph({ text: title, heading: HeadingLevel.TITLE, spacing: { after: 300 } }),
      p('Prepared by [Your name] · [Date]', { spacing: { after: 500 } }),
    );
    const sections =
      id === 'writer-meeting'
        ? [
            ['Meeting details', 'Date: [Date]   ·   Attendees: [Names]   ·   Facilitator: [Name]'],
            ['Agenda', '1. Progress since last meeting\n2. Decisions to make\n3. Next actions'],
            ['Decisions', 'Record the decision, its context and the responsible owner.'],
          ]
        : id === 'writer-proposal'
          ? [
              [
                'The opportunity',
                'Describe your client’s situation and the outcome this project will deliver.',
              ],
              [
                'Scope & deliverables',
                'Define the work included, the deliverables and the acceptance criteria.',
              ],
              ['Approach & timeline', 'Outline phases, milestones and dependencies.'],
              ['Commercial terms', 'Add the agreed budget, payment terms and assumptions.'],
            ]
          : [
              [
                'Executive summary',
                'Summarize the purpose, findings and recommended actions. Replace this example text with your analysis.',
              ],
              [
                'Context & objectives',
                'Describe the business context and what success looks like.',
              ],
              [
                'Findings & analysis',
                'Present your evidence. Insert images, charts, captions, footnotes or additional tables using the editor ribbon.',
              ],
              [
                'Recommendations',
                'List the actions to take, the responsible owners and expected outcomes.',
              ],
            ];
    for (const [heading, body] of sections) {
      children.push(
        new Paragraph({
          text: heading,
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 300, after: 160 },
        }),
        ...body.split('\n').map((text) => p(text, { spacing: { after: 180 } })),
      );
    }
    children.push(
      new Paragraph({
        text: id === 'writer-meeting' ? 'Action register' : 'Delivery plan',
        heading: HeadingLevel.HEADING_1,
      }),
      table([
        ['Item', 'Owner', 'Due / measure'],
        ['[Action or deliverable]', '[Name]', '[Date / KPI]'],
        ['[Action or deliverable]', '[Name]', '[Date / KPI]'],
        ['[Action or deliverable]', '[Name]', '[Date / KPI]'],
      ]),
    );
  } else children.push(p(''));
  return Packer.toBuffer(
    new Document({
      creator: 'Reverse Office',
      title,
      styles: {
        default: {
          document: {
            run: { font: 'Aptos', size: 23, color: '283B32' },
            paragraph: { spacing: { after: 160, line: 290 } },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              size: { width: 11906, height: 16838 },
              margin: { top: 1100, right: 1100, bottom: 1100, left: 1100 },
            },
          },
          headers: {
            default: new Header({
              children: [new Paragraph({ text: title, alignment: AlignmentType.RIGHT })],
            }),
          },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun('Page '), new TextRun({ children: [PageNumber.CURRENT] })],
                }),
              ],
            }),
          },
          children,
        },
      ],
    }),
  );
}
async function addWorkbookChart(bytes, labels, series, title) {
  const zip = await JSZip.loadAsync(bytes);
  let types = await zip.file('[Content_Types].xml').async('string');
  types = types.replace(
    '</Types>',
    '<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>',
  );
  zip.file('[Content_Types].xml', types);
  let sheet = await zip.file('xl/worksheets/sheet1.xml').async('string');
  sheet = sheet.replace('</worksheet>', '<drawing r:id="rIdChart"/></worksheet>');
  zip.file('xl/worksheets/sheet1.xml', sheet);
  const relpath = 'xl/worksheets/_rels/sheet1.xml.rels';
  let rel =
    (await zip.file(relpath)?.async('string')) ??
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  rel = rel.replace(
    '</Relationships>',
    '<Relationship Id="rIdChart" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>',
  );
  zip.file(relpath, rel);
  zip.file(
    'xl/drawings/drawing1.xml',
    '<?xml version="1.0"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:twoCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>12</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>7</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>28</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Budget chart"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>',
  );
  zip.file(
    'xl/drawings/_rels/drawing1.xml.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/></Relationships>',
  );
  const esc = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;');
  const ser = series
    .map(
      (s, i) =>
        `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${esc(s.name)}</c:v></c:tx><c:spPr><a:solidFill><a:srgbClr val="${i ? 'D6966A' : '34876D'}"/></a:solidFill></c:spPr><c:cat><c:strRef><c:f>'Overview'!$A$4:$A$${labels.length + 3}</c:f><c:strCache><c:ptCount val="${labels.length}"/>${labels.map((l, j) => `<c:pt idx="${j}"><c:v>${esc(l)}</c:v></c:pt>`).join('')}</c:strCache></c:strRef></c:cat><c:val><c:numRef><c:f>'Overview'!$${i ? 'C' : 'B'}$4:$${i ? 'C' : 'B'}$${labels.length + 3}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${s.values.length}"/>${s.values.map((v, j) => `<c:pt idx="${j}"><c:v>${v}</c:v></c:pt>`).join('')}</c:numCache></c:numRef></c:val></c:ser>`,
    )
    .join('');
  zip.file(
    'xl/charts/chart1.xml',
    `<?xml version="1.0"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${esc(title)}</a:t></a:r></a:p></c:rich></c:tx></c:title><c:autoTitleDeleted val="0"/><c:plotArea><c:layout/><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/>${ser}<c:axId val="100"/><c:axId val="200"/></c:barChart><c:catAx><c:axId val="100"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="b"/><c:crossAx val="200"/><c:crosses val="autoZero"/></c:catAx><c:valAx><c:axId val="200"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="l"/><c:majorGridlines/><c:crossAx val="100"/><c:crosses val="autoZero"/></c:valAx></c:plotArea><c:legend><c:legendPos val="b"/></c:legend><c:plotVisOnly val="1"/></c:chart></c:chartSpace>`,
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}
async function workbook(id, title) {
  const b = new ExcelJS.Workbook();
  b.creator = 'Reverse Office';
  const s = b.addWorksheet('Overview', { views: [{ state: 'frozen', ySplit: 3 }] });
  s.columns = [{ width: 28 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 25 }];
  s.mergeCells('A1:E1');
  s.getCell('A1').value = title;
  s.getCell('A1').font = { size: 22, bold: true, color: { argb: 'FF245741' } };
  s.getRow(1).height = 40;
  let labels = [],
    series = [];
  if (id === 'sheet-budget' || id === 'sheet-sales') {
    const sales = id === 'sheet-sales';
    labels = sales
      ? ['January', 'February', 'March', 'April', 'May', 'June']
      : ['People', 'Software', 'Research', 'Travel', 'Operations', 'Contingency'];
    const planned = sales
        ? [14000, 16000, 17000, 18500, 20000, 21000]
        : [25000, 4000, 3000, 2000, 3500, 2500],
      actual = sales
        ? [14800, 15900, 19200, 18100, 22100, 24000]
        : [24000, 4200, 2800, 1700, 3300, 800];
    series = [
      { name: sales ? 'Target' : 'Budget', values: planned },
      { name: sales ? 'Revenue' : 'Actual', values: actual },
    ];
    s.getRow(3).values = [
      sales ? 'Month' : 'Category',
      series[0].name,
      series[1].name,
      'Variance',
      'Variance %',
    ];
    labels.forEach((l, i) => {
      const r = i + 4;
      s.getRow(r).values = [
        l,
        planned[i],
        actual[i],
        { formula: `C${r}-B${r}`, result: actual[i] - planned[i] },
        { formula: `IFERROR(D${r}/B${r},0)`, result: (actual[i] - planned[i]) / planned[i] },
      ];
      s.getCell(`E${r}`).numFmt = '0.0%';
    });
    const last = labels.length + 4;
    s.getRow(last).values = [
      'Total',
      { formula: `SUM(B4:B${last - 1})` },
      { formula: `SUM(C4:C${last - 1})` },
      { formula: `C${last}-B${last}` },
    ];
    s.getRow(last).font = { bold: true };
    s.autoFilter = { from: 'A3', to: `E${last - 1}` };
    s.getColumn(2).numFmt = '#,##0.00';
    s.getColumn(3).numFmt = '#,##0.00';
    s.getColumn(4).numFmt = '#,##0.00';
    s.addConditionalFormatting({
      ref: `D4:D${last - 1}`,
      rules: [
        {
          type: 'cellIs',
          operator: 'lessThan',
          formulae: [0],
          priority: 1,
          style: { font: { color: { argb: 'FFC35555' } } },
        },
      ],
    });
    const notes = b.addWorksheet('Assumptions');
    notes.columns = [{ width: 30 }, { width: 65 }];
    notes.addRows([
      ['Assumption', 'Value'],
      ['Currency', 'Set your reporting currency'],
      ['Owner', 'Your team'],
      ['Notes', 'Replace sample figures. Charts and formulas update from Overview.'],
    ]);
  } else if (id === 'sheet-tracker') {
    s.getRow(3).values = ['Milestone', 'Owner', 'Due date', 'Status', 'Completion'];
    for (let i = 4; i <= 13; i++) {
      s.getRow(i).values = [i === 4 ? 'Kick-off' : '', '', null, 'Not started', 0];
      s.getCell(`D${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"Not started,In progress,Blocked,Done"'],
      };
      s.getCell(`E${i}`).numFmt = '0%';
      s.getCell(`C${i}`).numFmt = 'yyyy-mm-dd';
    }
    s.autoFilter = 'A3:E13';
  }
  s.getRow(3).eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF245741' } };
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.alignment = { vertical: 'middle' };
  });
  s.getRow(3).height = 26;
  b.calcProperties.fullCalcOnLoad = true;
  const bytes = Buffer.from(await b.xlsx.writeBuffer());
  return series.length ? addWorkbookChart(bytes, labels, series, title) : bytes;
}
async function presentation(id, title) {
  const deck = new pptxgen();
  deck.layout = 'LAYOUT_WIDE';
  deck.author = 'Reverse Office';
  deck.title = title;
  const color = id === 'slides-review' ? '5961AD' : id === 'slides-workshop' ? '277B70' : '245741';
  const headings =
    id === 'slides-blank'
      ? [title]
      : id === 'slides-pitch'
        ? [
            title,
            'The opportunity',
            'Our approach',
            'What we deliver',
            'A plan that moves us forward',
            'The numbers',
            'Meet the team',
            'Let’s build what’s next',
          ]
        : id === 'slides-review'
          ? [
              title,
              'The quarter at a glance',
              'Performance',
              'What we learned',
              'Next quarter',
              'Discussion & decisions',
            ]
          : [
              title,
              'Today’s agenda',
              'A shared starting point',
              'Time to explore',
              'From ideas to action',
              'What happens next',
            ];
  headings.forEach((h, i) => {
    const s = deck.addSlide();
    const cover = i === 0 || i === headings.length - 1;
    s.background = { color: cover ? color : 'F7F5EF' };
    s.addShape(deck.ShapeType.rect, {
      x: 0.6,
      y: 0.6,
      w: 0.5,
      h: 0.06,
      fill: { color: cover ? 'D7E7C0' : color },
      line: { transparency: 100 },
    });
    s.addText(
      'REVERSE OFFICE  /  ' +
        (id === 'slides-pitch'
          ? 'STUDIO PITCH'
          : id === 'slides-workshop'
            ? 'TEAM WORKSHOP'
            : 'QUARTERLY REVIEW'),
      {
        x: 1.2,
        y: 0.49,
        w: 10,
        h: 0.3,
        fontSize: 10,
        charSpacing: 3,
        color: cover ? 'D7E7C0' : color,
      },
    );
    s.addText(h, {
      x: 0.8,
      y: cover ? 2 : 1.25,
      w: 11.5,
      h: 1.5,
      fontSize: cover ? 46 : 34,
      bold: true,
      fontFace: 'Aptos Display',
      color: cover ? 'FFFFFF' : color,
      margin: 0,
      breakLine: false,
    });
    if (!cover && (h === 'The numbers' || h === 'Performance'))
      s.addChart(
        deck.ChartType.bar,
        [
          { name: 'Target', labels: ['Jan', 'Feb', 'Mar', 'Apr'], values: [12, 16, 18, 22] },
          { name: 'Actual', labels: ['Jan', 'Feb', 'Mar', 'Apr'], values: [14, 17, 21, 25] },
        ],
        {
          x: 0.9,
          y: 2.8,
          w: 10.8,
          h: 3.4,
          catAxisLabelFontSize: 12,
          valAxisLabelFontSize: 12,
          showLegend: true,
          legendPos: 'b',
          chartColors: [color, 'D9986A'],
          showTitle: false,
          showValue: false,
          showBorder: false,
        },
      );
    else if (!cover) {
      ['01', '02', '03'].forEach((n, j) => {
        s.addShape(deck.ShapeType.roundRect, {
          x: 0.8 + j * 4.1,
          y: 3,
          w: 3.8,
          h: 2.8,
          radius: 0.15,
          fill: { color: 'FFFFFF' },
          line: { color: 'E4E8DE', width: 1 },
        });
        s.addText(n, { x: 1.05 + j * 4.1, y: 3.2, w: 1, h: 0.4, fontSize: 15, bold: true, color });
        s.addText(['Make it clear', 'Make it useful', 'Make it happen'][j], {
          x: 1.05 + j * 4.1,
          y: 3.9,
          w: 3.2,
          h: 0.5,
          fontSize: 21,
          bold: true,
          color: '2A3E34',
        });
        s.addText(
          'Replace this text with your key point. Add images, diagrams, video or a chart from Insert.',
          { x: 1.05 + j * 4.1, y: 4.7, w: 3.1, h: 0.8, fontSize: 15, color: '65736B' },
        );
      });
    } else {
      s.addText(
        i === 0
          ? 'A clear story. A shared direction.\n[Team name]  ·  [Date]'
          : 'Questions, ideas and the next conversation.',
        { x: 0.85, y: 4.2, w: 9, h: 1, fontSize: 22, color: 'DBE6D9' },
      );
      s.addShape(deck.ShapeType.ellipse, {
        x: 10.3,
        y: 4.9,
        w: 2.3,
        h: 2.3,
        line: { color: 'A9C2A5', width: 3 },
        fill: { color, transparency: 100 },
      });
    }
    s.addText(String(i + 1).padStart(2, '0'), {
      x: 0.8,
      y: 6.9,
      w: 1,
      h: 0.25,
      fontSize: 10,
      color: cover ? 'C4D7BE' : '6D7B72',
    });
    s.addNotes('Speaker notes: add your talking points, examples and transitions here.');
  });
  return Buffer.from(await deck.write({ outputType: 'nodebuffer' }));
}
export async function createTemplate(id, title) {
  const t = templates.find((t) => t.id === id);
  if (!t) throw Error('Unknown template');
  return t.kind === 'doc'
    ? writer(id, title)
    : t.kind === 'sheet'
      ? workbook(id, title)
      : presentation(id, title);
}
