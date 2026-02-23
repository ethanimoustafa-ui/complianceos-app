/**
 * Export utility functions for CSV and PDF generation
 */

// Type for exportable data
type ExportableData = Record<string, unknown>

interface ExportOptions {
  filename: string
  title?: string
  headers?: string[]
}

/**
 * Escape a value for CSV format
 */
function escapeCSVValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  const stringValue = String(value)

  // If the value contains a comma, newline, or quote, wrap it in quotes
  if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
    return `"${stringValue.replace(/"/g, '""')}"`
  }

  return stringValue
}

/**
 * Convert data to CSV format
 */
function dataToCSV(data: ExportableData[], columns?: string[]): string {
  if (data.length === 0) {
    return ''
  }

  // Get column headers from first item or use provided columns
  const headers = columns || Object.keys(data[0])

  // Create header row
  const headerRow = headers.map(escapeCSVValue).join(',')

  // Create data rows
  const dataRows = data.map((item) =>
    headers.map((header) => escapeCSVValue(item[header])).join(',')
  )

  return [headerRow, ...dataRows].join('\n')
}

/**
 * Trigger a file download in the browser
 * Includes UTF-8 BOM for proper Arabic text display in Excel
 */
function downloadFile(content: string, filename: string, mimeType: string): void {
  // Add UTF-8 BOM for Excel to correctly display Arabic/Unicode characters
  const bom = '\uFEFF'
  const blob = new Blob([bom + content], { type: mimeType })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}

/**
 * Export data to CSV file
 */
export function exportToCSV<T extends ExportableData>(
  data: T[],
  options: ExportOptions
): void {
  const csv = dataToCSV(data, options.headers)
  const filename = options.filename.endsWith('.csv') ? options.filename : `${options.filename}.csv`

  downloadFile(csv, filename, 'text/csv;charset=utf-8;')
}

/**
 * Export audit findings to CSV
 */
export function exportAuditFindings(
  findings: Array<{
    id: string
    name: string
    category: string
    severity: string
    owner?: { name: string }
    status: string
  }>,
  filename = 'audit-findings'
): void {
  const exportData = findings.map((finding) => ({
    ID: finding.id,
    Name: finding.name,
    Category: finding.category,
    Severity: finding.severity,
    Owner: finding.owner?.name || 'Unassigned',
    Status: finding.status,
  }))

  exportToCSV(exportData, {
    filename,
    headers: ['ID', 'Name', 'Category', 'Severity', 'Owner', 'Status'],
  })
}

/**
 * Translation function type for export localization
 * Uses generic type to accept any translation function signature
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TranslationFunction = (key: any, params?: any) => string

/**
 * Format date based on locale
 */
function formatExportDate(dateStr: string | undefined, isRTL: boolean, naText: string): string {
  if (!dateStr) return naText
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return dateStr
  return date.toLocaleDateString(isRTL ? 'ar-SA' : 'en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
}

/**
 * Export observations to CSV with localization support
 */
export function exportObservations(
  observations: Array<{
    id: string
    title: string
    subTitle?: string
    reference?: string
    description?: string
    source: string
    severity: string
    status: string
    dueDate?: string
    department?: string
    assignees?: Array<{ name: string; role?: string }>
    assignee?: { name: string; role?: string }
    documents?: Array<{ name: string }>
    checklist?: Array<{ completed: boolean }>
  }>,
  filename = 'observations',
  t?: TranslationFunction,
  isRTL = false
): void {
  // Default translations for backwards compatibility
  const getText = (key: string, fallback: string) => t ? t(key) : fallback

  const naText = getText('export.na', 'N/A')
  const unassignedText = getText('export.unassigned', 'Unassigned')
  const noneText = getText('export.none', 'None')
  const noChecklistText = getText('export.noChecklist', 'No checklist')

  const exportData = observations.map((obs) => {
    // Get assignees from assignees array or single assignee
    const assigneesList = obs.assignees && obs.assignees.length > 0
      ? obs.assignees.map(a => a.name).join('; ')
      : obs.assignee?.name || unassignedText

    // Get documents list
    const documentsList = obs.documents && obs.documents.length > 0
      ? obs.documents.map(d => d.name).join('; ')
      : noneText

    // Calculate checklist progress
    const checklistTotal = obs.checklist?.length || 0
    const checklistCompleted = obs.checklist?.filter(c => c.completed).length || 0
    const checklistProgress = checklistTotal > 0
      ? `${checklistCompleted}/${checklistTotal} (${Math.round((checklistCompleted / checklistTotal) * 100)}%)`
      : noChecklistText

    // Get translated source
    const sourceKey = `observations.sources.${obs.source}`
    const translatedSource = t ? t(sourceKey) : obs.source

    // Get translated severity
    const severityKey = `observations.severityOptions.${obs.severity}`
    const translatedSeverity = t ? t(severityKey) : obs.severity

    // Get translated status
    const statusKey = `observations.statusOptions.${obs.status === 'resolved' ? 'pendingReview' : obs.status === 'in_progress' ? 'inProgress' : obs.status}`
    const translatedStatus = t ? t(statusKey) : obs.status

    return {
      [getText('export.reference', 'Reference')]: obs.reference || naText,
      [getText('export.title', 'Title')]: obs.title,
      [getText('export.subTitle', 'Sub-Title')]: obs.subTitle || '',
      [getText('export.source', 'Source')]: translatedSource,
      [getText('export.severity', 'Severity')]: translatedSeverity,
      [getText('export.status', 'Status')]: translatedStatus,
      [getText('export.dueDate', 'Due Date')]: formatExportDate(obs.dueDate, isRTL, naText),
      [getText('export.department', 'Department')]: obs.department || naText,
      [getText('export.assignees', 'Assignees')]: assigneesList,
      [getText('export.description', 'Description')]: obs.description || '',
      [getText('export.documents', 'Documents')]: documentsList,
      [getText('export.checklistProgress', 'Checklist Progress')]: checklistProgress,
    }
  })

  // Localized headers
  const headers = [
    getText('export.reference', 'Reference'),
    getText('export.title', 'Title'),
    getText('export.subTitle', 'Sub-Title'),
    getText('export.source', 'Source'),
    getText('export.severity', 'Severity'),
    getText('export.status', 'Status'),
    getText('export.dueDate', 'Due Date'),
    getText('export.department', 'Department'),
    getText('export.assignees', 'Assignees'),
    getText('export.description', 'Description'),
    getText('export.documents', 'Documents'),
    getText('export.checklistProgress', 'Checklist Progress'),
  ]

  exportToCSV(exportData, {
    filename,
    headers,
  })
}

/**
 * Export audit logs to CSV
 */
export function exportAuditLogs(
  logs: Array<{
    id: number | string
    timestamp: string
    audit: string
    action: string
    description: string
    status: string
    user?: string
  }>,
  filename = 'audit-logs'
): void {
  const exportData = logs.map((log) => ({
    ID: log.id,
    Timestamp: log.timestamp,
    Audit: log.audit,
    Action: log.action,
    Description: log.description,
    Status: log.status,
    User: log.user || 'Unknown',
  }))

  exportToCSV(exportData, {
    filename,
    headers: ['ID', 'Timestamp', 'Audit', 'Action', 'Description', 'Status', 'User'],
  })
}

/**
 * Export audit logs to CSV with localization support
 */
export function exportAuditLogsLocalized(
  logs: Array<{
    id: string
    timestamp: Date
    user: { name: string }
    action: string
    audit: string
    description: string
    status: string
  }>,
  filename = 'audit-logs',
  t?: TranslationFunction,
  isRTL = false
): void {
  const getText = (key: string, fallback: string) => t ? t(key) : fallback

  const headers = [
    getText('export.timestamp', 'Timestamp'),
    getText('export.user', 'User'),
    getText('export.action', 'Action'),
    getText('export.audit', 'Audit'),
    getText('export.description', 'Description'),
    getText('export.status', 'Status'),
  ]

  const exportData = logs.map((log) => {
    const translatedAction = t ? t(`reports.${log.action}`) : log.action
    const translatedStatus = t ? t(`reports.${log.status}`) : log.status
    const ts = log.timestamp instanceof Date
      ? log.timestamp.toLocaleString(isRTL ? 'ar-SA' : 'en-US')
      : String(log.timestamp)

    return {
      [headers[0]]: ts,
      [headers[1]]: log.user.name,
      [headers[2]]: translatedAction,
      [headers[3]]: log.audit,
      [headers[4]]: log.description,
      [headers[5]]: translatedStatus,
    }
  })

  exportToCSV(exportData, { filename, headers })
}

/**
 * Export a single audit log entry to CSV
 */
export function exportSingleLog(
  log: {
    id: string
    timestamp: Date
    user: { name: string }
    action: string
    audit: string
    description: string
    status: string
  },
  filename = 'audit-log-entry',
  t?: TranslationFunction,
  isRTL = false
): void {
  exportAuditLogsLocalized([log], filename, t, isRTL)
}

/**
 * Export audits to CSV with localization support
 */
export function exportAuditsLocalized(
  audits: Array<{
    id: string
    name: string
    responsible: { name: string }
    dueDate: Date
    status: string
    priority: string
    progress: number
    source: string
    frequency: string
    category: string
  }>,
  filename = 'audits',
  t?: TranslationFunction,
  isRTL = false
): void {
  const getText = (key: string, fallback: string) => t ? t(key) : fallback

  const sourceLabels: Record<string, string> = {
    sama_inspection: t ? t('reports.samaInspection') : 'SAMA Inspection',
    internal_audit: t ? t('reports.internalAudit') : 'Internal Audit',
    sharia_audit: t ? t('reports.shariaAudit') : 'Sharia Audit',
  }

  const statusLabels: Record<string, string> = {
    in_progress: t ? t('reports.inProgress') : 'In Progress',
    pending: t ? t('reports.pending') : 'Pending',
    in_review: t ? t('reports.inReview') : 'In Review',
    completed: t ? t('reports.completed') : 'Completed',
    overdue: t ? t('reports.overdue') : 'Overdue',
  }

  const priorityLabels: Record<string, string> = {
    critical: t ? t('reports.critical') : 'Critical',
    high: t ? t('reports.high') : 'High',
    medium: t ? t('reports.medium') : 'Medium',
    low: t ? t('reports.low') : 'Low',
  }

  const frequencyLabels: Record<string, string> = {
    annual: t ? t('reports.annual') : 'Annual',
    semi_annual: t ? t('reports.semiAnnual') : 'Semi-Annual',
    quarterly: t ? t('reports.quarterly') : 'Quarterly',
    monthly: t ? t('reports.monthly') : 'Monthly',
    ad_hoc: t ? t('reports.adHoc') : 'Ad Hoc',
  }

  const categoryLabels: Record<string, string> = {
    security_compliance: t ? t('reports.security') : 'Security',
    financial_compliance: t ? t('reports.financial') : 'Financial',
    regulatory_compliance: t ? t('reports.regulatory') : 'Regulatory',
    operational_compliance: t ? t('reports.operational') : 'Operational',
    hr_compliance: t ? t('reports.hr') : 'HR',
    sharia_compliance: t ? t('reports.sharia') : 'Sharia',
  }

  const headers = [
    getText('export.auditName', 'Audit Name'),
    getText('export.responsible', 'Responsible'),
    getText('export.dueDate', 'Due Date'),
    getText('export.status', 'Status'),
    getText('export.priority', 'Priority'),
    getText('export.progress', 'Progress'),
    getText('export.source', 'Source'),
    getText('export.frequency', 'Frequency'),
    getText('export.category', 'Category'),
  ]

  const exportData = audits.map((audit) => ({
    [headers[0]]: audit.name,
    [headers[1]]: audit.responsible.name,
    [headers[2]]: formatExportDate(audit.dueDate.toISOString(), isRTL, ''),
    [headers[3]]: statusLabels[audit.status] || audit.status,
    [headers[4]]: priorityLabels[audit.priority] || audit.priority,
    [headers[5]]: `${audit.progress}%`,
    [headers[6]]: sourceLabels[audit.source] || audit.source,
    [headers[7]]: frequencyLabels[audit.frequency] || audit.frequency,
    [headers[8]]: categoryLabels[audit.category] || audit.category,
  }))

  exportToCSV(exportData, { filename, headers })
}

/**
 * Export executive compliance report to CSV with localization support
 */
export function exportExecutiveReport(
  scoreData: {
    overall: number
    confidence: string
    change: number
    components: Record<string, { score: number; weight: number; confidence: string }>
    frameworks: Record<string, { score: number; confidence: string }>
    deductions: Array<{ points: number; description: string; descriptionKey?: string; descriptionParams?: Record<string, string>; severity: string }>
  },
  findings: Array<{
    auditName: string
    severity: string
    status: string
    dueDate: Date
    owner: { name: string }
  }>,
  riskDistribution: Array<{ category: string; percentage: number }>,
  filename = 'executive-report',
  t?: TranslationFunction,
  isRTL = false
): void {
  const getText = (key: string, fallback: string) => t ? t(key) : fallback
  const naText = getText('export.na', 'N/A')

  const sectionHeader = getText('export.section', 'Section')
  const rows: ExportableData[] = []

  // Section 1: Overview
  const overviewSection = getText('export.overallScore', 'Overall Score')
  rows.push({
    [sectionHeader]: overviewSection,
    [getText('export.component', 'Component')]: getText('export.overallScore', 'Overall Score'),
    [getText('export.score', 'Score')]: `${scoreData.overall}%`,
    [getText('export.confidence', 'Confidence')]: t ? t(`reports.confidence${scoreData.confidence.charAt(0).toUpperCase() + scoreData.confidence.slice(1)}`) : scoreData.confidence,
    [getText('export.weight', 'Weight')]: '',
    [getText('export.severity', 'Severity')]: '',
    [getText('export.points', 'Points')]: '',
    [getText('export.percentage', 'Percentage')]: '',
  })
  rows.push({
    [sectionHeader]: overviewSection,
    [getText('export.component', 'Component')]: getText('export.change', 'Change vs Last Period'),
    [getText('export.score', 'Score')]: `${scoreData.change > 0 ? '+' : ''}${scoreData.change}%`,
    [getText('export.confidence', 'Confidence')]: '',
    [getText('export.weight', 'Weight')]: '',
    [getText('export.severity', 'Severity')]: '',
    [getText('export.points', 'Points')]: '',
    [getText('export.percentage', 'Percentage')]: '',
  })

  // Section 2: Components
  const compSection = getText('export.components', 'Components')
  const componentLabels: Record<string, string> = {
    auditCompletion: t ? t('reports.compAuditCompletion') : 'Audit Completion',
    observationClosure: t ? t('reports.compObservationClosure') : 'Observation Closure',
    riskPosture: t ? t('reports.compRiskPosture') : 'Risk Posture',
    policyCurrency: t ? t('reports.compPolicyCurrency') : 'Policy Currency',
    trainingCompletion: t ? t('reports.compTrainingCompletion') : 'Training Completion',
  }
  for (const [key, comp] of Object.entries(scoreData.components)) {
    rows.push({
      [sectionHeader]: compSection,
      [getText('export.component', 'Component')]: componentLabels[key] || key,
      [getText('export.score', 'Score')]: `${comp.score}%`,
      [getText('export.confidence', 'Confidence')]: t ? t(`reports.confidence${comp.confidence.charAt(0).toUpperCase() + comp.confidence.slice(1)}`) : comp.confidence,
      [getText('export.weight', 'Weight')]: `${comp.weight}%`,
      [getText('export.severity', 'Severity')]: '',
      [getText('export.points', 'Points')]: '',
      [getText('export.percentage', 'Percentage')]: '',
    })
  }

  // Section 3: Frameworks
  const fwSection = getText('export.frameworks', 'Frameworks')
  const frameworkLabels: Record<string, string> = {
    sama: 'SAMA',
    internal: t ? t('reports.internalAudit') : 'Internal Audit',
    sharia: t ? t('reports.shariaAudit') : 'Sharia Audit',
  }
  for (const [key, fw] of Object.entries(scoreData.frameworks)) {
    rows.push({
      [sectionHeader]: fwSection,
      [getText('export.component', 'Component')]: frameworkLabels[key] || key,
      [getText('export.score', 'Score')]: `${fw.score}%`,
      [getText('export.confidence', 'Confidence')]: t ? t(`reports.confidence${fw.confidence.charAt(0).toUpperCase() + fw.confidence.slice(1)}`) : fw.confidence,
      [getText('export.weight', 'Weight')]: '',
      [getText('export.severity', 'Severity')]: '',
      [getText('export.points', 'Points')]: '',
      [getText('export.percentage', 'Percentage')]: '',
    })
  }

  // Section 4: Deductions
  const dedSection = getText('export.deductions', 'Deductions')
  for (const ded of scoreData.deductions) {
    const description = ded.descriptionKey && t
      ? t(ded.descriptionKey, ded.descriptionParams)
      : ded.description
    rows.push({
      [sectionHeader]: dedSection,
      [getText('export.component', 'Component')]: description,
      [getText('export.score', 'Score')]: '',
      [getText('export.confidence', 'Confidence')]: '',
      [getText('export.weight', 'Weight')]: '',
      [getText('export.severity', 'Severity')]: t ? t(`reports.${ded.severity}`) : ded.severity,
      [getText('export.points', 'Points')]: `-${ded.points}`,
      [getText('export.percentage', 'Percentage')]: '',
    })
  }

  // Section 5: Risk Distribution
  const riskSection = getText('export.riskDistribution', 'Risk Distribution')
  const riskCatLabels: Record<string, string> = {
    operational: t ? t('reports.operational') : 'Operational',
    financial: t ? t('reports.financial') : 'Financial',
    compliance: t ? t('reports.compliance') : 'Compliance',
    strategic: t ? t('reports.strategic') : 'Strategic',
    reputational: t ? t('reports.reputational') : 'Reputational',
  }
  for (const rd of riskDistribution) {
    rows.push({
      [sectionHeader]: riskSection,
      [getText('export.component', 'Component')]: riskCatLabels[rd.category] || rd.category,
      [getText('export.score', 'Score')]: '',
      [getText('export.confidence', 'Confidence')]: '',
      [getText('export.weight', 'Weight')]: '',
      [getText('export.severity', 'Severity')]: '',
      [getText('export.points', 'Points')]: '',
      [getText('export.percentage', 'Percentage')]: `${rd.percentage}%`,
    })
  }

  // Section 6: Audit Findings
  const findSection = getText('export.findings', 'Audit Findings')
  for (const f of findings) {
    rows.push({
      [sectionHeader]: findSection,
      [getText('export.component', 'Component')]: f.auditName,
      [getText('export.score', 'Score')]: '',
      [getText('export.confidence', 'Confidence')]: '',
      [getText('export.weight', 'Weight')]: '',
      [getText('export.severity', 'Severity')]: t ? t(`reports.${f.severity}`) : f.severity,
      [getText('export.points', 'Points')]: '',
      [getText('export.percentage', 'Percentage')]: '',
      [getText('export.status', 'Status')]: t ? t(`reports.${f.status}`) : f.status,
      [getText('export.dueDate', 'Due Date')]: formatExportDate(f.dueDate.toISOString(), isRTL, naText),
      [getText('export.owner', 'Owner')]: f.owner.name,
    })
  }

  const headers = [
    sectionHeader,
    getText('export.component', 'Component'),
    getText('export.score', 'Score'),
    getText('export.confidence', 'Confidence'),
    getText('export.weight', 'Weight'),
    getText('export.severity', 'Severity'),
    getText('export.points', 'Points'),
    getText('export.percentage', 'Percentage'),
    getText('export.status', 'Status'),
    getText('export.dueDate', 'Due Date'),
    getText('export.owner', 'Owner'),
  ]

  exportToCSV(rows, { filename, headers })
}

/**
 * Export risk register to CSV with localization support
 */
export function exportRisksLocalized(
  risks: Array<{
    id: string
    name: string
    description: string
    category: string
    likelihood: number
    impact: number
    owner: { name: string; department: string }
    status: string
    mitigationProgress: number
    monitoringFrequency: string
  }>,
  filename = 'risk-register',
  t?: TranslationFunction,
  isRTL = false
): void {
  const getText = (key: string, fallback: string) => t ? t(key) : fallback

  const categoryLabels: Record<string, string> = {
    operational: t ? t('reports.operational') : 'Operational',
    financial: t ? t('reports.financial') : 'Financial',
    compliance: t ? t('reports.compliance') : 'Compliance',
    strategic: t ? t('reports.strategic') : 'Strategic',
    reputational: t ? t('reports.reputational') : 'Reputational',
  }

  const statusLabels: Record<string, string> = {
    open: t ? t('reports.open') : 'Open',
    mitigating: t ? t('reports.mitigating') : 'Mitigating',
    accepted: t ? t('reports.accepted') : 'Accepted',
    closed: t ? t('reports.closed') : 'Closed',
  }

  const freqLabels: Record<string, string> = {
    weekly: t ? t('reports.weekly') : 'Weekly',
    monthly: t ? t('reports.monthly') : 'Monthly',
    quarterly: t ? t('reports.quarterly') : 'Quarterly',
    semi_annual: t ? t('reports.semiAnnual') : 'Semi-Annual',
    annual: t ? t('reports.annual') : 'Annual',
  }

  function getRiskLevelLabel(score: number): string {
    if (score >= 20) return t ? t('reports.critical') : 'Critical'
    if (score >= 12) return t ? t('reports.high') : 'High'
    if (score >= 6) return t ? t('reports.medium') : 'Medium'
    return t ? t('reports.low') : 'Low'
  }

  const headers = [
    'ID',
    getText('export.riskName', 'Risk Name'),
    getText('export.description', 'Description'),
    getText('export.category', 'Category'),
    getText('export.likelihood', 'Likelihood'),
    getText('export.impact', 'Impact'),
    getText('export.score', 'Score'),
    getText('export.riskLevel', 'Risk Level'),
    getText('export.status', 'Status'),
    getText('export.owner', 'Owner'),
    getText('export.department', 'Department'),
    getText('export.mitigationProgress', 'Mitigation Progress'),
    getText('export.monitoringFrequency', 'Monitoring Frequency'),
  ]

  const exportData = risks.map((risk) => {
    const score = risk.likelihood * risk.impact
    return {
      [headers[0]]: risk.id,
      [headers[1]]: risk.name,
      [headers[2]]: risk.description,
      [headers[3]]: categoryLabels[risk.category] || risk.category,
      [headers[4]]: risk.likelihood,
      [headers[5]]: risk.impact,
      [headers[6]]: score,
      [headers[7]]: getRiskLevelLabel(score),
      [headers[8]]: statusLabels[risk.status] || risk.status,
      [headers[9]]: risk.owner.name,
      [headers[10]]: risk.owner.department,
      [headers[11]]: `${risk.mitigationProgress}%`,
      [headers[12]]: freqLabels[risk.monitoringFrequency] || risk.monitoringFrequency,
    }
  })

  exportToCSV(exportData, { filename, headers })
}

/**
 * Export correspondence to CSV with localization support
 */
export function exportCorrespondenceLocalized(
  items: Array<{
    reference?: string
    subject: string
    type: string
    status: string
    from: string
    to: string[]
    date: string
    archived?: boolean
  }>,
  filename = 'correspondence',
  t?: TranslationFunction,
  isRTL = false
): void {
  const getText = (key: string, fallback: string) => t ? t(key) : fallback

  const statusLabels: Record<string, string> = {
    draft: t ? t('common.draft') : 'Draft',
    sent: t ? t('correspondence.sent') : 'Sent',
    received: t ? t('correspondence.received') : 'Received',
  }

  const typeLabels: Record<string, string> = {
    internal: t ? t('correspondence.internal') : 'Internal',
    external: t ? t('correspondence.external') : 'External',
    sama: 'SAMA',
  }

  const headers = [
    getText('export.reference', 'Reference'),
    getText('export.subject', 'Subject'),
    getText('export.type', 'Type'),
    getText('export.status', 'Status'),
    getText('export.from', 'From'),
    getText('export.to', 'To'),
    getText('export.date', 'Date'),
    getText('export.archived', 'Archived'),
  ]

  const exportData = items.map((item) => ({
    [headers[0]]: item.reference || '',
    [headers[1]]: item.subject,
    [headers[2]]: typeLabels[item.type] || item.type,
    [headers[3]]: statusLabels[item.status] || item.status,
    [headers[4]]: item.from,
    [headers[5]]: item.to.join('; '),
    [headers[6]]: formatExportDate(item.date, isRTL, ''),
    [headers[7]]: item.archived ? (t ? t('common.yes') : 'Yes') : (t ? t('common.no') : 'No'),
  }))

  exportToCSV(exportData, { filename, headers })
}

/**
 * Export advisory requests to CSV with localization support
 */
export function exportAdvisoryLocalized(
  requests: Array<{
    ref: string
    subject: string
    businessUnit: string
    status: string
    priority: string
    requestedBy: string
    requestedDate: string
    assignedTo?: string
    notes: Array<unknown>
  }>,
  filename = 'advisory-requests',
  t?: TranslationFunction,
  isRTL = false
): void {
  const getText = (key: string, fallback: string) => t ? t(key) : fallback

  const statusLabels: Record<string, string> = {
    pending: t ? t('common.pending') : 'Pending',
    in_progress: t ? t('advisory.inProgress') : 'In Progress',
    completed: t ? t('common.completed') : 'Completed',
  }

  const priorityLabels: Record<string, string> = {
    low: t ? t('advisory.low') : 'Low',
    medium: t ? t('advisory.medium') : 'Medium',
    high: t ? t('advisory.high') : 'High',
  }

  const unitLabels: Record<string, string> = {
    corporate_banking: t ? t('advisory.corporateBanking') : 'Corporate Banking',
    compliance: t ? t('advisory.compliance') : 'Compliance',
    it: t ? t('advisory.it') : 'IT',
    risk_management: t ? t('advisory.riskManagement') : 'Risk Management',
    finance: t ? t('advisory.finance') : 'Finance',
    operations: t ? t('advisory.operations') : 'Operations',
    hr: t ? t('advisory.hr') : 'HR',
  }

  const headers = [
    getText('export.reference', 'Ref'),
    getText('export.subject', 'Subject'),
    getText('export.businessUnit', 'Business Unit'),
    getText('export.status', 'Status'),
    getText('export.priority', 'Priority'),
    getText('export.requestedBy', 'Requested By'),
    getText('export.date', 'Date'),
    getText('export.assignedTo', 'Assigned To'),
    getText('export.notesCount', 'Notes Count'),
  ]

  const naText = getText('export.unassigned', 'Unassigned')

  const exportData = requests.map((req) => ({
    [headers[0]]: req.ref,
    [headers[1]]: req.subject,
    [headers[2]]: unitLabels[req.businessUnit] || req.businessUnit,
    [headers[3]]: statusLabels[req.status] || req.status,
    [headers[4]]: priorityLabels[req.priority] || req.priority,
    [headers[5]]: req.requestedBy,
    [headers[6]]: formatExportDate(req.requestedDate, isRTL, ''),
    [headers[7]]: req.assignedTo || naText,
    [headers[8]]: req.notes.length,
  }))

  exportToCSV(exportData, { filename, headers })
}

/**
 * Export requirements to CSV with localization support
 */
export function exportRequirementsLocalized(
  requirements: Array<{
    name: string
    category: string
    releaseDate: string
    status: string
    dueDate: string
    progress: number
  }>,
  filename = 'requirements',
  t?: TranslationFunction,
  isRTL = false
): void {
  const getText = (key: string, fallback: string) => t ? t(key) : fallback

  const statusLabels: Record<string, string> = {
    pending: t ? t('common.pending') : 'Pending',
    drafting: t ? t('correspondence.drafting') : 'Drafting',
    implementing: t ? t('correspondence.implementing') : 'Implementing',
    completed: t ? t('common.completed') : 'Completed',
  }

  const headers = [
    getText('export.name', 'Name'),
    getText('export.category', 'Category'),
    getText('export.releaseDate', 'Release Date'),
    getText('export.status', 'Status'),
    getText('export.dueDate', 'Due Date'),
    getText('export.progress', 'Progress'),
  ]

  const exportData = requirements.map((req) => ({
    [headers[0]]: req.name,
    [headers[1]]: req.category,
    [headers[2]]: formatExportDate(req.releaseDate, isRTL, ''),
    [headers[3]]: statusLabels[req.status] || req.status,
    [headers[4]]: formatExportDate(req.dueDate, isRTL, ''),
    [headers[5]]: `${req.progress}%`,
  }))

  exportToCSV(exportData, { filename, headers })
}

/**
 * Generate a simple HTML-based printable report (can be saved as PDF via browser print)
 */
export function generatePrintableReport(
  title: string,
  data: ExportableData[],
  options?: { columns?: string[]; subtitle?: string }
): void {
  if (data.length === 0) {
    alert('No data to export')
    return
  }

  const columns = options?.columns || Object.keys(data[0])

  const tableRows = data
    .map(
      (item) =>
        `<tr>${columns
          .map((col) => `<td style="border: 1px solid #ddd; padding: 8px;">${item[col] ?? ''}</td>`)
          .join('')}</tr>`
    )
    .join('')

  const tableHeaders = columns
    .map(
      (col) =>
        `<th style="border: 1px solid #ddd; padding: 8px; background: #f5f5f5; text-align: left;">${col}</th>`
    )
    .join('')

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #333; }
        h2 { color: #666; font-size: 14px; font-weight: normal; }
        table { border-collapse: collapse; width: 100%; margin-top: 20px; }
        .footer { margin-top: 30px; font-size: 12px; color: #666; }
        @media print {
          body { margin: 0; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <h1>${title}</h1>
      ${options?.subtitle ? `<h2>${options.subtitle}</h2>` : ''}
      <table>
        <thead><tr>${tableHeaders}</tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
      <div class="footer">
        Generated on ${new Date().toLocaleString()} | ComplianceOS
      </div>
      <div class="no-print" style="margin-top: 20px;">
        <button onclick="window.print()" style="padding: 10px 20px; cursor: pointer;">
          Print / Save as PDF
        </button>
      </div>
    </body>
    </html>
  `

  const printWindow = window.open('', '_blank')
  if (printWindow) {
    printWindow.document.write(html)
    printWindow.document.close()
  }
}

/**
 * Export data to PDF via print dialog
 */
export function exportToPDF<T extends ExportableData>(
  data: T[],
  options: ExportOptions & { subtitle?: string }
): void {
  generatePrintableReport(options.title || options.filename, data, {
    columns: options.headers,
    subtitle: options.subtitle,
  })
}
