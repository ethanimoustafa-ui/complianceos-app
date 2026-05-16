export function translateTimelineTitle(
  title: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const EXACT: Record<string, string> = {
    'Draft Created':          t('letters.letterCreatedDraft'),
    'Submitted for Approval': t('letters.letterSubmittedApproval'),
    'Compliance Approved':    t('letters.complianceApproved'),
    'All Steps Approved':     t('letters.allStepsApproved'),
    // Legacy literals (pre-authority): keep mapping so old persisted timelines still translate
    'Sent to SAMA':           t('letters.letterSentToSama'),
    'Pending SAMA Reply':     t('letters.pendingSamaReply'),
    'Pending SAMA reply':     t('letters.pendingSamaReply'),
    'Response Received':      t('letters.letterResponseReceived'),
  }
  if (EXACT[title]) return EXACT[title]

  // Dynamic authority forms: 'Sent to <AUTHORITY>' / 'Pending <AUTHORITY> reply'
  const sentMatch = title.match(/^Sent to ([A-Z]+)$/)
  if (sentMatch) return t('letters.letterSentToAuthority', { authority: sentMatch[1] })
  const pendingMatch = title.match(/^Pending ([A-Z]+) (?:Reply|reply)$/)
  if (pendingMatch) return t('letters.pendingAuthorityReply', { authority: pendingMatch[1] })

  // Translate legacy "Field updated" events from the removed editLetter feature
  const FIELD_UPDATED: Record<string, string> = {
    'Subject updated':               t('letters.subjectUpdated'),
    'Arabic Subject updated':        t('letters.subjectArUpdated'),
    'Body updated':                  t('letters.bodyUpdated'),
    'Arabic Body updated':           t('letters.bodyArUpdated'),
    'Priority updated':              t('letters.priorityUpdated'),
    'SAMA Department updated':       t('letters.departmentUpdated'),
    'Letter Type updated':           t('letters.letterTypeUpdated'),
    'Sub-Category updated':          t('letters.subCategoryUpdated'),
    'Signer Name updated':           t('letters.signerNameUpdated'),
    'Signer Title updated':          t('letters.signerTitleUpdated'),
    'Recipient Name updated':        t('letters.recipientNameUpdated'),
    'Recipient Organization updated':t('letters.recipientOrgUpdated'),
  }
  if (FIELD_UPDATED[title]) return FIELD_UPDATED[title]

  if (title.startsWith('Approved by '))
    return `${t('letters.approvedBy')} ${title.slice('Approved by '.length)}`

  if (title.startsWith('Rejected by ')) {
    // Translate legacy "No reason provided" suffix stored in older events
    const rest = title.slice('Rejected by '.length)
      .replace('No reason provided', t('letters.noReasonProvided'))
    return `${t('letters.rejectedBy')} ${rest}`
  }

  return title
}
