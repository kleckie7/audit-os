import type { AuditQuestion, Framework } from '@/lib/types'
import iso27001 from './iso27001.json'
import iso42001 from './iso42001.json'
import nistCsf from './nist-csf.json'
import nist80053 from './nist-800-53.json'
import coso from './coso.json'
import cobit from './cobit.json'
import mitreAttack from './mitre-attack.json'
import soc2 from './soc2.json'
import pciDss from './pci-dss.json'

// Central framework registry. Main agent replaces the placeholder JSON files
// with full control data before page agents run — shape stays stable.

export const FRAMEWORKS: Framework[] = [
  iso27001,
  iso42001,
  nistCsf,
  nist80053,
  coso,
  cobit,
  mitreAttack,
  soc2,
  pciDss,
] as Framework[]

const byId = new Map<string, Framework>(FRAMEWORKS.map((f) => [f.id, f]))

export function getFramework(id: string): Framework | undefined {
  return byId.get(id)
}

/** Flat list of every question in a framework (across phases). */
export function allQuestions(frameworkId: string): AuditQuestion[] {
  const fw = byId.get(frameworkId)
  if (!fw) return []
  return fw.phases.flatMap((p) => p.questions)
}

export function questionCount(frameworkId: string): number {
  return allQuestions(frameworkId).length
}
