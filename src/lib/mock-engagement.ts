import type { Engagement } from '@/lib/types'

// Realistic mock engagement for the dashboard. Other agents: this is the
// shape of a live Engagement object (see src/lib/types.ts).

export const MOCK_ENGAGEMENT: Engagement = {
  id: 'ENG-2025-0147',
  client: 'Meridian Financial Group',
  name: 'FY25 Integrated Audit',
  startedAt: '2025-01-06T09:00:00Z',
  auditor: 'J. Mercer',
  frameworks: [
    'iso27001',
    'iso42001',
    'nist-csf',
    'nist-800-53',
    'coso',
    'cobit',
    'mitre-attack',
    'soc2',
    'pci-dss',
  ],
  answers: {
    'iso27001-q001': {
      status: 'compliant',
      notes: 'ISMS policy v4.2 approved by board 2024-11; communicated via intranet.',
      evidenceChecked: ['EV-001 Policy document'],
      flagged: false,
      updatedAt: '2025-01-21T14:07:00Z',
    },
    'iso42001-q001': {
      status: 'partial',
      notes: 'AIMS scope drafted but AI inventory incomplete for shadow ML models.',
      evidenceChecked: [],
      flagged: true,
      updatedAt: '2025-01-21T11:42:00Z',
    },
    'nist-csf-q001': {
      status: 'compliant',
      notes: 'Risk appetite statement ratified in Q4 governance committee minutes.',
      evidenceChecked: ['EV-001 Policy document'],
      flagged: false,
      updatedAt: '2025-01-20T16:20:00Z',
    },
    'nist-800-53-q001': {
      status: 'compliant',
      notes: 'AC policy disseminated; annual review cycle evidenced.',
      evidenceChecked: ['EV-001 Policy document'],
      flagged: false,
      updatedAt: '2025-01-19T10:05:00Z',
    },
    'coso-q001': {
      status: 'partial',
      notes: 'Code of conduct attestation coverage at 92%; contractor cohort missing.',
      evidenceChecked: [],
      flagged: false,
      updatedAt: '2025-01-20T09:31:00Z',
    },
    'cobit-q001': {
      status: 'noncompliant',
      notes: 'No documented EDM governance charter; decisions tracked informally in email.',
      evidenceChecked: [],
      flagged: true,
      updatedAt: '2025-01-21T13:15:00Z',
    },
    'mitre-attack-q001': {
      status: 'partial',
      notes: 'Phishing detections live in SIEM; coverage gaps for T1566.002 (spearphishing links).',
      evidenceChecked: [],
      flagged: false,
      updatedAt: '2025-01-18T15:48:00Z',
    },
    'soc2-q001': {
      status: 'compliant',
      notes: 'Values program with annual attestation; HR confirms 100% FTE completion.',
      evidenceChecked: ['EV-001 Policy document'],
      flagged: false,
      updatedAt: '2025-01-17T12:00:00Z',
    },
    'pci-dss-q001': {
      status: 'partial',
      notes: 'NSC standards exist; segmentation rules for CDE not fully documented.',
      evidenceChecked: [],
      flagged: false,
      updatedAt: '2025-01-21T08:22:00Z',
    },
  },
}
