// Mock dashboard metrics for ENG-2025-0147. Replaced by live store-derived
// numbers once full framework data lands; Home + TopBar consume this shape.

export interface FrameworkProgressMock {
  id: string
  name: string
  version: string
  assessedPct: number
  compliantPct?: number
  nextControl: string
  worstDomain: { name: string; status: 'compliant' | 'partial' | 'noncompliant' | 'na' }
  domains: { name: string; compliant: number; partial: number; noncompliant: number; na: number }[]
  category: 'security' | 'governance' | 'privacy' | 'threat'
}

export const MOCK_DASHBOARD = {
  overallProgressPct: 62,
  overallCompliancePct: 68,
  complianceDelta: '+4% THIS WEEK',
  controlsAssessed: 214,
  controlsTotal: 487,
  openFindings: 23,
  findingsBySeverity: { high: 7, medium: 11, low: 5 },
  evidenceItems: 156,
  evidenceDelta: '+18 THIS WEEK',
  interviewsDone: 12,
  interviewsTotal: 18,
  nextInterview: 'CISO · TUE 10:00',
  currentPhase: 2, // 0-based index into PHASES (FIELDWORK)
  currentPhaseProgress: 60,
}

export const PHASES = [
  { id: 'scoping', label: 'SCOPING', dates: 'JAN 06–10' },
  { id: 'planning', label: 'PLANNING', dates: 'JAN 13–17' },
  { id: 'fieldwork', label: 'FIELDWORK', dates: 'JAN 20–FEB 07' },
  { id: 'findings', label: 'FINDINGS & RATING', dates: 'FEB 10–12' },
  { id: 'reporting', label: 'REPORTING', dates: 'FEB 13–14' },
]

export const MOCK_FRAMEWORK_PROGRESS: FrameworkProgressMock[] = [
  {
    id: 'iso27001',
    name: 'ISO 27001:2022',
    version: '2022',
    assessedPct: 78,
    compliantPct: 71,
    nextControl: 'A.5.15 ACCESS CONTROL',
    worstDomain: { name: 'Organizational', status: 'partial' },
    domains: [
      { name: 'ORG', compliant: 62, partial: 22, noncompliant: 6, na: 10 },
      { name: 'PEOPLE', compliant: 74, partial: 14, noncompliant: 4, na: 8 },
      { name: 'PHYS', compliant: 81, partial: 9, noncompliant: 2, na: 8 },
      { name: 'TECH', compliant: 68, partial: 18, noncompliant: 9, na: 5 },
    ],
    category: 'security',
  },
  {
    id: 'iso42001',
    name: 'ISO 42001',
    version: '2023',
    assessedPct: 42,
    nextControl: '§6.1 AI RISK PLANNING',
    worstDomain: { name: 'Impact Assessment', status: 'noncompliant' },
    domains: [
      { name: 'CONTEXT', compliant: 40, partial: 30, noncompliant: 20, na: 10 },
      { name: 'LEAD', compliant: 35, partial: 35, noncompliant: 20, na: 10 },
      { name: 'PLAN', compliant: 28, partial: 26, noncompliant: 36, na: 10 },
      { name: 'OPS', compliant: 45, partial: 25, noncompliant: 20, na: 10 },
    ],
    category: 'governance',
  },
  {
    id: 'nist-csf',
    name: 'NIST CSF 2.0',
    version: '2.0',
    assessedPct: 65,
    nextControl: 'PR.AA-03',
    worstDomain: { name: 'IDENTIFY', status: 'partial' },
    domains: [
      { name: 'GV', compliant: 58, partial: 24, noncompliant: 8, na: 10 },
      { name: 'ID', compliant: 44, partial: 30, noncompliant: 16, na: 10 },
      { name: 'PR', compliant: 66, partial: 20, noncompliant: 6, na: 8 },
      { name: 'DE', compliant: 70, partial: 16, noncompliant: 6, na: 8 },
      { name: 'RS', compliant: 60, partial: 22, noncompliant: 10, na: 8 },
      { name: 'RC', compliant: 72, partial: 14, noncompliant: 6, na: 8 },
    ],
    category: 'security',
  },
  {
    id: 'coso',
    name: 'COSO',
    version: '2013',
    assessedPct: 80,
    nextControl: 'PRINCIPLE 13',
    worstDomain: { name: 'Control Activities', status: 'partial' },
    domains: [
      { name: 'CE', compliant: 76, partial: 12, noncompliant: 4, na: 8 },
      { name: 'RA', compliant: 70, partial: 16, noncompliant: 6, na: 8 },
      { name: 'CA', compliant: 58, partial: 26, noncompliant: 8, na: 8 },
      { name: 'IC', compliant: 74, partial: 14, noncompliant: 4, na: 8 },
      { name: 'MA', compliant: 78, partial: 10, noncompliant: 4, na: 8 },
    ],
    category: 'governance',
  },
  {
    id: 'cobit',
    name: 'COBIT 2019',
    version: '2019',
    assessedPct: 55,
    nextControl: 'APO11.04',
    worstDomain: { name: 'MEA', status: 'noncompliant' },
    domains: [
      { name: 'EDM', compliant: 48, partial: 22, noncompliant: 20, na: 10 },
      { name: 'APO', compliant: 56, partial: 24, noncompliant: 10, na: 10 },
      { name: 'BAI', compliant: 62, partial: 20, noncompliant: 8, na: 10 },
      { name: 'DSS', compliant: 58, partial: 22, noncompliant: 10, na: 10 },
      { name: 'MEA', compliant: 34, partial: 24, noncompliant: 32, na: 10 },
    ],
    category: 'governance',
  },
  {
    id: 'mitre-attack',
    name: 'MITRE ATT&CK',
    version: 'v16',
    assessedPct: 61,
    nextControl: 'TA0003 PRIV ESCALATION',
    worstDomain: { name: 'Persistence', status: 'partial' },
    domains: [
      { name: 'TA0001', compliant: 64, partial: 20, noncompliant: 8, na: 8 },
      { name: 'TA0003', compliant: 42, partial: 28, noncompliant: 20, na: 10 },
      { name: 'TA0004', compliant: 55, partial: 25, noncompliant: 12, na: 8 },
      { name: 'TA0007', compliant: 68, partial: 16, noncompliant: 8, na: 8 },
      { name: 'TA0010', compliant: 60, partial: 22, noncompliant: 10, na: 8 },
    ],
    category: 'threat',
  },
  {
    id: 'soc2',
    name: 'SOC 2',
    version: 'TSC 2017',
    assessedPct: 72,
    nextControl: 'CC6.6',
    worstDomain: { name: 'Logical Access', status: 'partial' },
    domains: [
      { name: 'CC', compliant: 70, partial: 16, noncompliant: 6, na: 8 },
      { name: 'AVAIL', compliant: 74, partial: 12, noncompliant: 6, na: 8 },
      { name: 'CONF', compliant: 66, partial: 20, noncompliant: 6, na: 8 },
      { name: 'PI', compliant: 62, partial: 22, noncompliant: 8, na: 8 },
    ],
    category: 'security',
  },
  {
    id: 'pci-dss',
    name: 'PCI DSS 4.0',
    version: '4.0',
    assessedPct: 38,
    nextControl: 'REQ 8.3.6',
    worstDomain: { name: 'Access Control', status: 'noncompliant' },
    domains: [
      { name: 'NET', compliant: 44, partial: 26, noncompliant: 20, na: 10 },
      { name: 'DATA', compliant: 40, partial: 28, noncompliant: 22, na: 10 },
      { name: 'VULN', compliant: 36, partial: 30, noncompliant: 24, na: 10 },
      { name: 'ACCESS', compliant: 30, partial: 26, noncompliant: 34, na: 10 },
      { name: 'MONITOR', compliant: 42, partial: 28, noncompliant: 20, na: 10 },
      { name: 'POLICY', compliant: 46, partial: 26, noncompliant: 18, na: 10 },
    ],
    category: 'security',
  },
]

export const MOCK_HEATMAP: {
  framework: string
  cells: ({ status: 'compliant' | 'partial' | 'noncompliant'; count: number } | null)[]
}[] = [
  {
    framework: 'ISO 27001',
    cells: [
      { status: 'partial', count: 2 },
      { status: 'compliant', count: 0 },
      { status: 'compliant', count: 0 },
      { status: 'noncompliant', count: 4 },
      { status: 'compliant', count: 0 },
      { status: 'partial', count: 1 },
      null,
      { status: 'compliant', count: 0 },
    ],
  },
  {
    framework: 'ISO 42001',
    cells: [
      { status: 'noncompliant', count: 3 },
      { status: 'partial', count: 2 },
      null,
      { status: 'partial', count: 1 },
      { status: 'noncompliant', count: 2 },
      null,
      null,
      { status: 'partial', count: 1 },
    ],
  },
  {
    framework: 'NIST CSF',
    cells: [
      { status: 'partial', count: 2 },
      { status: 'partial', count: 3 },
      { status: 'compliant', count: 0 },
      { status: 'compliant', count: 0 },
      { status: 'partial', count: 1 },
      { status: 'compliant', count: 0 },
      null,
      { status: 'compliant', count: 0 },
    ],
  },
  {
    framework: 'COSO',
    cells: [
      { status: 'compliant', count: 0 },
      { status: 'partial', count: 1 },
      { status: 'partial', count: 2 },
      { status: 'compliant', count: 0 },
      { status: 'compliant', count: 0 },
      null,
      null,
      { status: 'compliant', count: 0 },
    ],
  },
  {
    framework: 'COBIT',
    cells: [
      { status: 'noncompliant', count: 2 },
      { status: 'partial', count: 2 },
      { status: 'compliant', count: 0 },
      { status: 'partial', count: 1 },
      { status: 'noncompliant', count: 3 },
      null,
      null,
      { status: 'partial', count: 1 },
    ],
  },
  {
    framework: 'ATT&CK',
    cells: [
      { status: 'compliant', count: 0 },
      { status: 'noncompliant', count: 2 },
      { status: 'partial', count: 2 },
      { status: 'compliant', count: 0 },
      { status: 'partial', count: 1 },
      { status: 'compliant', count: 0 },
      null,
      { status: 'partial', count: 1 },
    ],
  },
]

export const HEATMAP_COLUMNS = ['ORG', 'PEOPLE', 'PHYS', 'TECH', 'DATA', 'IDENT', 'DETECT', 'RESP']

export const MOCK_ACTIVITY = [
  { status: 'noncompliant', text: 'A.5.15 Access control marked Non-Compliant — flagged', time: '14:07', actor: 'JM' },
  { status: 'compliant', text: 'EV-104 access-review-Q3.pdf uploaded to PR.AA-03', time: '13:52', actor: 'JM' },
  { status: 'compliant', text: 'CISO session completed · 41 answers captured', time: '12:30', actor: 'DO' },
  { status: 'noncompliant', text: 'Finding F-023 opened: MFA not enforced on VPN', time: '11:48', actor: 'JM' },
  { status: 'partial', text: 'APO11.04 MEA quality metrics marked Partial', time: '11:12', actor: 'JM' },
  { status: 'compliant', text: 'CC6.6 boundary protections verified compliant', time: '10:37', actor: 'RK' },
  { status: 'compliant', text: 'EV-098 siem-rule-export.json attached to DE.CM-01', time: '09:55', actor: 'RK' },
  { status: 'partial', text: 'Principle 13 information quality marked Partial', time: '09:20', actor: 'JM' },
]

export const MOCK_INTERVIEWS = [
  { name: 'D. OKAFOR', role: 'CISO', datetime: 'TUE 10:00 · 45 MIN', questions: '41 QUESTIONS · 6 FRAMEWORKS', ready: true },
  { name: 'R. KOVAC', role: 'IT OPS LEAD', datetime: 'TUE 14:00 · 30 MIN', questions: '28 QUESTIONS · 4 FRAMEWORKS', ready: true },
  { name: 'S. IBRAHIM', role: 'DPO', datetime: 'WED 09:30 · 45 MIN', questions: '33 QUESTIONS · 5 FRAMEWORKS', ready: false },
  { name: 'M. LINDQVIST', role: 'CRO', datetime: 'WED 13:00 · 60 MIN', questions: '22 QUESTIONS · 3 FRAMEWORKS', ready: false },
  { name: 'T. NAKAMURA', role: 'SEC ENG', datetime: 'THU 10:30 · 45 MIN', questions: '37 QUESTIONS · 5 FRAMEWORKS', ready: true },
]
